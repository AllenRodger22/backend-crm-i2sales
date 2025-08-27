// src/controllers/clientController.js
const multer = require('multer');
const csv = require('fast-csv');
const { Readable } = require('stream');
const db = require('../config/database');

// --- Helpers snake_case <-> camelCase ---
const snakeToCamel = (str) => str.replace(/([-_][a-z])/g, (g) => g.toUpperCase().replace('_', ''));
const camelToSnake = (str) => str.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);

const convertObjectKeys = (obj, converter) => {
  if (obj === null || typeof obj !== 'object' || obj instanceof Date) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => convertObjectKeys(item, converter));
  }
  const newObj = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const newKey = (key === 'from_status' || key === 'to_status') ? key : converter(key);
      newObj[newKey] = convertObjectKeys(obj[key], converter);
    }
  }
  return newObj;
};

// --- Smart Currency Parser ---
const parseCurrency = (value) => {
    if (typeof value !== 'string' || !value) return null;
    // Standardize decimal separator to a period, remove thousands separators.
    const sanitized = value.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(sanitized);
    // Return null if parsing fails (e.g., invalid input)
    return isNaN(parsed) ? null : parsed;
};

// Centralized authorization check
const authorizeAccess = (user, client) => {
    if (user.role === 'ADMIN' || user.role === 'MANAGER') {
        return true;
    }
    if (user.role === 'BROKER' && client.owner_id === user.id) {
        return true;
    }
    return false;
};


exports.upload = multer({ storage: multer.memoryStorage() });

// POST /clients/import
exports.importClients = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Nenhum arquivo enviado.' });
  if (!req.body.mapping) return res.status(400).json({ message: 'Mapeamento de colunas não fornecido.' });

  let mapping;
  try {
    mapping = JSON.parse(req.body.mapping);
  } catch (e) {
    return res.status(400).json({ message: 'Mapeamento de colunas inválido.' });
  }

  const requiredDbFields = ['name', 'phone', 'source'];
  const mappedDbFields = Object.values(mapping);
  for (const field of requiredDbFields) {
    if (!mappedDbFields.includes(field)) {
      return res.status(400).json({ message: `O campo obrigatório '${field}' não foi mapeado.` });
    }
  }

  const ownerId = req.user.id;
  const clientsToImport = [];
  const stream = Readable.from(req.file.buffer.toString('utf-8'));

  csv
    .parseStream(stream, { headers: true })
    .on('error', (error) => res.status(400).json({ message: 'Erro ao processar CSV.', details: error.message }))
    .on('data', (row) => clientsToImport.push(row))
    .on('end', async () => {
      let importedCount = 0;
      let skippedCount = 0;
      
      const reverseMapping = {};
      for (const key in mapping) {
        reverseMapping[mapping[key]] = key;
      }

      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');

        for (const row of clientsToImport) {
          const name = row[reverseMapping.name];
          const phone = row[reverseMapping.phone];
          const source = row[reverseMapping.source];

          if (!name || !phone || !source) {
            skippedCount++;
            continue;
          }

          try {
            await client.query(
              `INSERT INTO clients
               (name, phone, source, email, status, owner_id, observations, product, property_value)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [
                name,
                phone,
                source,
                row[reverseMapping.email] ?? null,
                'Primeiro Atendimento',
                ownerId,
                row[reverseMapping.observations] ?? null,
                row[reverseMapping.product] ?? null,
                parseCurrency(row[reverseMapping.propertyValue]) ?? null,
              ]
            );
            importedCount++;
          } catch (e) {
            console.warn('Skipping row due to insert error:', row, e.message);
            skippedCount++;
          }
        }

        await client.query('COMMIT');
        return res.status(200).json({ success: true, imported: importedCount, skipped: skippedCount });
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Database error during import:', error);
        return res.status(500).json({ message: 'Erro de banco de dados durante a importação.' });
      } finally {
        client.release();
      }
    });
};

// GET /clients/export
exports.exportClients = async (req, res) => {
  const { id: ownerId, role } = req.user;

  let userName;
  try {
      const userRes = await db.query('SELECT name FROM users WHERE id = $1', [ownerId]);
      if (userRes.rows.length > 0) {
          userName = userRes.rows[0].name;
      }
  } catch(e) {
      console.error("Could not fetch user's name for export, using default.", e);
  }
  
  const toSnakeCase = (str) =>
    str
        ? str
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '_')
        : 'export';

  const userNameSnakeCase = toSnakeCase(userName);
  const exportDate = new Date().toISOString().split('T')[0];
  const filename = `${userNameSnakeCase}_${exportDate}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  
  let query;
  let params = [];

  if (role === 'ADMIN' || role === 'MANAGER') {
      query = `SELECT name, phone, email, source, status, observations, product, property_value FROM clients`;
  } else {
      query = `SELECT name, phone, email, source, status, observations, product, property_value FROM clients WHERE owner_id = $1`;
      params.push(ownerId);
  }

  try {
    const { rows } = await db.query(query, params);
    csv.write(rows, { headers: true }).pipe(res);
  } catch (error) {
    console.error('Error exporting clients:', error);
    res.status(500).json({ error: 'Erro ao exportar clientes.' });
  }
};

// GET /clients?q=&status=
exports.getAllClients = async (req, res) => {
  const { q, status } = req.query;
  const { id: userId, role } = req.user;
  
  let whereClauses = [];
  let params = [];
  let paramIndex = 1;

  if (role === 'BROKER') {
      whereClauses.push(`c.owner_id = $${paramIndex++}`);
      params.push(userId);
  }

  if (q) {
      whereClauses.push(`(c.name ILIKE $${paramIndex} OR c.phone ILIKE $${paramIndex} OR c.source ILIKE $${paramIndex})`);
      params.push(`%${q}%`);
      paramIndex++;
  }
  if (status) {
      whereClauses.push(`c.status = $${paramIndex++}`);
      params.push(status);
  }

  const whereStatement = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const query = `
    SELECT 
      c.*,
      COALESCE(
        (
          SELECT json_agg(sub)
          FROM (
            SELECT 
              id, "type", observation, from_status, to_status, created_at AS "date"
            FROM interactions 
            WHERE client_id = c.id 
            ORDER BY created_at DESC
          ) AS sub
        ),
        '[]'::json
      ) AS interactions
    FROM clients c
    ${whereStatement}
    GROUP BY c.id
    ORDER BY c.created_at DESC;
  `;

  try {
    const { rows } = await db.query(query, params);
    res.status(200).json(convertObjectKeys(rows, snakeToCamel));
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Erro ao buscar clientes.' });
  }
};

// GET /clients/:clientId
exports.getClientById = async (req, res) => {
  const { clientId } = req.params;
  const user = req.user;

  try {
    const clientRes = await db.query('SELECT * FROM clients WHERE id = $1', [clientId]);
    if (clientRes.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    
    const clientData = clientRes.rows[0];

    if (!authorizeAccess(user, clientData)) {
      return res.status(403).json({ error: 'Acesso não autorizado.' });
    }

    const interactionsRes = await db.query(
      `SELECT id, "type", observation, from_status, to_status, created_at AS "date"
       FROM interactions 
       WHERE client_id = $1 
       ORDER BY created_at DESC`,
      [clientId]
    );

    clientData.interactions = interactionsRes.rows;
    res.status(200).json(convertObjectKeys(clientData, snakeToCamel));
  } catch (error) {
    console.error(`Error fetching client ${clientId}:`, error);
    res.status(500).json({ error: 'Erro ao buscar cliente.' });
  }
};

// POST /clients
exports.createClient = async (req, res) => {
  const { name, phone, email, source, status, observations, product, propertyValue } = req.body;
  const ownerId = req.user.id;
  
  const propertyValueForDb = parseCurrency(propertyValue);

  try {
    const { rows } = await db.query(
      `INSERT INTO clients
       (name, phone, email, source, status, owner_id, observations, product, property_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [name, phone, email || null, source, status || 'Primeiro Atendimento', ownerId, observations || null, product || null, propertyValueForDb]
    );
    res.status(201).json(convertObjectKeys(rows[0], snakeToCamel));
  } catch (error) {
    console.error('Error creating client:', error);
    res.status(500).json({ error: 'Erro ao criar cliente.' });
  }
};

// PUT /clients/:clientId
exports.updateClient = async (req, res) => {
  const { clientId } = req.params;
  const user = req.user;
  const fields = req.body;

  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ error: 'O corpo da requisição não pode estar vazio.' });
  }
  
  try {
    // Step 1: Fetch the current state of the client to check permissions and state
    const clientRes = await db.query('SELECT * FROM clients WHERE id = $1', [clientId]);
    if (clientRes.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    const currentClient = clientRes.rows[0];

    // Step 2: Authorize access
    if (!authorizeAccess(user, currentClient)) {
      return res.status(403).json({ error: 'Acesso não autorizado.' });
    }

    // Step 3: State machine validation for follow_up_state
    if ('followUpState' in fields && fields.followUpState !== currentClient.follow_up_state) {
        const currentFollowUpState = currentClient.follow_up_state;
        const newFollowUpState = fields.followUpState;

        const validTransitions = {
          'Sem Follow Up': ['Ativo'],
          'Ativo': ['Atrasado', 'Concluido', 'Cancelado', 'Perdido'],
          'Atrasado': ['Ativo', 'Concluido', 'Cancelado', 'Perdido'],
          'Concluido': ['Ativo'],
          'Cancelado': ['Ativo'],
          'Perdido': ['Ativo'],
        };
        
        const allowedTransitions = validTransitions[currentFollowUpState];

        if (!allowedTransitions || !allowedTransitions.includes(newFollowUpState)) {
            return res.status(400).json({ 
                error: `Transição de estado de follow-up inválida de '${currentFollowUpState}' para '${newFollowUpState}'.`
            });
        }
    }
  
    // Step 4: Prepare and execute the update
    // Use the currency parser for the propertyValue field if it exists
    if (fields.propertyValue) {
      fields.propertyValue = parseCurrency(fields.propertyValue);
    }
    
    const snakeCaseFields = convertObjectKeys(fields, camelToSnake);
    
    // Use property_value for the database column name
    if (snakeCaseFields.property_value !== undefined) {
        snakeCaseFields.property_value = snakeCaseFields.property_value;
        delete snakeCaseFields.propertyValue;
    }

    const setClauses = Object.keys(snakeCaseFields).map((key, index) => {
      return `"${key}" = $${index + 1}`;
    }).join(', ');
    
    const values = Object.values(snakeCaseFields);
    
    const query = `
      UPDATE clients SET ${setClauses}, updated_at = NOW() 
      WHERE id = $${values.length + 1}
      RETURNING *;
    `;
  
    const { rows } = await db.query(query, [...values, clientId]);
    res.status(200).json(convertObjectKeys(rows[0], snakeToCamel));
  } catch (error) {
    console.error(`Error updating client ${clientId}:`, error);
    res.status(500).json({ error: 'Erro ao atualizar cliente.' });
  }
};

// DELETE /clients/:clientId
exports.deleteClient = async (req, res) => {
  const { clientId } = req.params;
  const user = req.user;

  // Authorization: Only Admins can permanently delete clients.
  if (user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Acesso não autorizado. Apenas administradores podem excluir clientes.' });
  }

  try {
    const deleteResult = await db.query('DELETE FROM clients WHERE id = $1', [clientId]);

    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    res.status(204).send(); // Successfully processed, no content to return.
  } catch (error) {
    console.error(`Error deleting client ${clientId}:`, error);
    res.status(500).json({ error: 'Erro ao excluir cliente.' });
  }
};