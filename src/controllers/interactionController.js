// src/controllers/interactionController.js
const db = require('../config/database');

const canAccessClient = (user, clientRow) => {
  if (user.role === 'ADMIN' || user.role === 'MANAGER') return true;
  if (user.role === 'BROKER' && clientRow.owner_id === user.id) return true;
  return false;
};

// CE = começa com "CE", "CE -", "CE:"
const isCE = (text) => typeof text === 'string' && /^CE(\s|[-:])?/i.test(text.trim());
const CADENCE_STATUS = 'Fluxo de Cadência';
const PRIMEIRO_AT = 'Primeiro Atendimento';

// POST /clients/:clientId/interactions
exports.create = async (req, res) => {
  const { clientId } = req.params;
  const user = req.user;
  const { type, observation } = req.body;

  // payload pode mandar status | toStatus | to_status
  const explicitNext = req.body.status ?? req.body.toStatus ?? req.body.to_status ?? null;

  const cx = await db.pool.connect();
  try {
    await cx.query('BEGIN');

    // Carrega cliente, trava a linha e valida acesso
    const cRes = await cx.query(
      'SELECT id, owner_id, status FROM clients WHERE id = $1 FOR UPDATE',
      [clientId]
    );
    if (cRes.rows.length === 0) {
      await cx.query('ROLLBACK');
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    const clientRow = cRes.rows[0];
    if (!canAccessClient(user, clientRow)) {
      await cx.query('ROLLBACK');
      return res.status(403).json({ error: 'Acesso não autorizado.' });
    }

    const fromStatus = clientRow.status;

    // --------- NOVA REGRA ----------
    // CE SÓ manda pra Fluxo de Cadência se status atual == "Primeiro Atendimento".
    // Caso contrário, ignora CE e usa apenas o status explícito (se houver).
    let nextStatus = null;
    if (isCE(observation) && fromStatus === PRIMEIRO_AT) {
      nextStatus = CADENCE_STATUS;
    } else if (explicitNext) {
      nextStatus = explicitNext;
    }
    // -------------------------------

    // Define to_status para a interação principal:
    // se houve mudança -> novo status; se não -> igual ao from_status
    const toStatusForRow =
      nextStatus && String(nextStatus).trim() !== '' && nextStatus !== fromStatus
        ? nextStatus
        : fromStatus;

    // 1) Grava a interação principal JÁ com from/to (mesmo sem mudança de status)
    const { rows: irows } = await cx.query(
      `INSERT INTO interactions (client_id, user_id, "type", observation, from_status, to_status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, client_id, user_id, "type", observation, from_status, to_status, created_at AS "date"`,
      [clientId, user.id, type, observation, fromStatus, toStatusForRow]
    );
    const mainInteraction = irows[0];

    // 2) Se mudou, atualiza clients.status e registra a interação de "Mudança de Status"
    let statusInteraction = null;
    if (toStatusForRow !== fromStatus) {
      const upd = await cx.query(
        `UPDATE clients SET status = $1, updated_at = NOW() WHERE id = $2`,
        [toStatusForRow, clientId]
      );
      if (upd.rowCount === 0) {
        await cx.query('ROLLBACK');
        return res.status(500).json({ error: 'Falha ao atualizar status do cliente.' });
      }

      const msg =
        isCE(observation) && fromStatus === PRIMEIRO_AT
          ? `Status alterado de '${fromStatus}' para '${toStatusForRow}' automaticamente após CE.`
          : `Status alterado de '${fromStatus}' para '${toStatusForRow}'`;

      const { rows: srows } = await cx.query(
        `INSERT INTO interactions (client_id, user_id, "type", observation, from_status, to_status)
         VALUES ($1, $2, 'Mudança de Status', $3, $4, $5)
         RETURNING id, client_id, user_id, "type", observation, from_status, to_status, created_at AS "date"`,
        [clientId, user.id, msg, fromStatus, toStatusForRow]
      );
      statusInteraction = srows[0];
    }

    await cx.query('COMMIT');
    return res.status(201).json({ interaction: mainInteraction, statusInteraction });
  } catch (err) {
    await cx.query('ROLLBACK');
    console.error('Erro ao criar interação:', err);
    return res.status(500).json({ error: 'Erro ao criar interação.' });
  } finally {
    cx.release();
  }
};

// GET /clients/:clientId/interactions (inalterado)
exports.listByClient = async (req, res) => {
  const { clientId } = req.params;
  try {
    const { rows } = await db.query(
      `SELECT id, client_id, user_id, "type", observation, from_status, to_status, created_at AS "date"
       FROM interactions
       WHERE client_id = $1
       ORDER BY created_at DESC`,
      [clientId]
    );
    return res.status(200).json(rows);
  } catch (err) {
    console.error('Erro ao listar interações:', err);
    return res.status(500).json({ error: 'Erro ao listar interações.' });
  }
};
