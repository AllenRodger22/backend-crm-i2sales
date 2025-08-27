// src/controllers/analyticsController.js
const db = require('../config/database');

// --- Helper Functions ---
const snakeToCamel = (str) => str.replace(/([-_][a-z])/g, (group) => group.toUpperCase().replace('_', ''));
const convertObjectKeys = (obj, converter) => {
    // FIX: Added 'obj instanceof Date' to prevent recursion on date objects.
    if (obj === null || typeof obj !== 'object' || obj instanceof Date) {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => convertObjectKeys(item, converter));
    }
    const newObj = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            newObj[converter(key)] = convertObjectKeys(obj[key], converter);
        }
    }
    return newObj;
};

// GET /analytics/kpis/broker
exports.getBrokerKpis = async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Sua sessão expirou ou é inválida. Por favor, faça o login novamente.' });
  }
  const brokerId = req.user.id;
  try {
    const followUpFuturoQuery = db.query(
        "SELECT COUNT(*) FROM clients WHERE owner_id = $1 AND follow_up_state = 'Ativo'",
        [brokerId]
    );
    const leadsPrimeiroAtendimentoQuery = db.query(
        "SELECT COUNT(*) FROM clients WHERE owner_id = $1 AND status = 'Primeiro Atendimento'",
        [brokerId]
    );
    const totalLeadsQuery = db.query(
        "SELECT COUNT(*) FROM clients WHERE owner_id = $1 AND status != 'Arquivado'",
        [brokerId]
    );
    const followUpAtrasadoQuery = db.query(
      "SELECT COUNT(*) FROM clients WHERE owner_id = $1 AND follow_up_state = 'Atrasado'",
      [brokerId]
    );

    const [
        followUpFuturoRes, 
        leadsPrimeiroAtendimentoRes, 
        totalLeadsRes,
        followUpAtrasadoRes
    ] = await Promise.all([
        followUpFuturoQuery,
        leadsPrimeiroAtendimentoQuery,
        totalLeadsQuery,
        followUpAtrasadoQuery
    ]);

    // FIX: Safely handle cases where a COUNT query might unexpectedly return no rows.
    // This prevents a server crash if a query result is empty.
    res.status(200).json({
      leadsEmTratativa: parseInt(followUpFuturoRes.rows?.[0]?.count || 0),
      leadsPrimeiroAtendimento: parseInt(leadsPrimeiroAtendimentoRes.rows?.[0]?.count || 0),
      totalLeads: parseInt(totalLeadsRes.rows?.[0]?.count || 0),
      followUpAtrasado: parseInt(followUpAtrasadoRes.rows?.[0]?.count || 0),
    });
  } catch (error) {
    console.error('Error fetching broker KPIs:', error);
    res.status(500).json({ error: 'Erro ao buscar KPIs.' });
  }
};

// GET /analytics/productivity
exports.getProductivity = async (req, res) => {
    const { startDate, endDate, brokerId } = req.query;
    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required.' });
    }
    if (!req.user) {
        return res.status(401).json({ error: 'Sua sessão expirou ou é inválida. Por favor, faça o login novamente.' });
    }
    const endOfDay = `${endDate}T23:59:59.999Z`;

    const params = [startDate, endOfDay];
    let userFilter = '';
    let clientOwnerFilter = ''; // For queries joining clients table

    // If logged in as BROKER, always filter by own ID.
    // If logged in as MANAGER/ADMIN, use the brokerId from query if provided.
    const targetBrokerId = req.user.role === 'BROKER' ? req.user.id : brokerId;

    if (targetBrokerId) {
        params.push(targetBrokerId);
        const paramIndex = params.length;
        userFilter = `AND i.user_id = $${paramIndex}`;
        clientOwnerFilter = `AND c.owner_id = $${paramIndex}`;
    }

    try {
        const kpisQuery = `
            SELECT
                COUNT(i.id) FILTER (WHERE i.type = 'Ligação Registrada') AS ligacoes,
                COUNT(i.id) FILTER (WHERE i.type = 'Ligação Registrada' AND i.observation LIKE 'CE%') AS ce,
                COUNT(DISTINCT i.client_id) FILTER (WHERE i.type = 'Ligação Registrada' AND i.observation LIKE 'CE%') AS tratativas,
                COUNT(DISTINCT i.client_id) FILTER (WHERE i.type = 'Mudança de Status' AND i.to_status = 'Doc Completa') AS documentacao,
                COUNT(DISTINCT i.client_id) FILTER (WHERE i.type = 'Mudança de Status' AND i.to_status = 'Venda Gerada') AS vendas
            FROM interactions i
            WHERE i.created_at BETWEEN $1 AND $2 ${userFilter};
        `;
        
        const timeseriesQuery = `
            SELECT
                DATE_TRUNC('day', i.created_at)::DATE AS "date",
                COUNT(i.id) FILTER (WHERE i.type = 'Ligação Registrada') AS ligacoes,
                COUNT(i.id) FILTER (WHERE i.type = 'Ligação Registrada' AND i.observation LIKE 'CE%') AS ce,
                COUNT(DISTINCT i.client_id) FILTER (WHERE i.type = 'Ligação Registrada' AND i.observation LIKE 'CE%') AS tratativas,
                COUNT(DISTINCT i.client_id) FILTER (WHERE i.type = 'Mudança de Status' AND i.to_status = 'Doc Completa') AS documentacao,
                COUNT(DISTINCT i.client_id) FILTER (WHERE i.type = 'Mudança de Status' AND i.to_status = 'Venda Gerada') AS vendas
            FROM interactions i
            WHERE i.created_at BETWEEN $1 AND $2 ${userFilter}
            GROUP BY date
            ORDER BY date;
        `;
        
        const brokerBreakdownQuery = `
            SELECT
                u.name AS broker,
                COUNT(i.id) FILTER (WHERE i.type = 'Ligação Registrada') AS ligacoes,
                COUNT(i.id) FILTER (WHERE i.type = 'Ligação Registrada' AND i.observation LIKE 'CE%') AS ce,
                COUNT(DISTINCT i.client_id) FILTER (WHERE i.type = 'Ligação Registrada' AND i.observation LIKE 'CE%') AS tratativas,
                COUNT(DISTINCT i.client_id) FILTER (WHERE i.type = 'Mudança de Status' AND i.to_status = 'Doc Completa') AS documentacao,
                COUNT(DISTINCT i.client_id) FILTER (WHERE i.type = 'Mudança de Status' AND i.to_status = 'Venda Gerada') AS vendas
            FROM interactions i
            JOIN users u ON i.user_id = u.id
            WHERE i.created_at BETWEEN $1 AND $2 ${userFilter}
            GROUP BY u.name
            ORDER BY u.name;
        `;

        const originBreakdownQuery = `
            SELECT
                c.source AS origem,
                COUNT(i.id) FILTER (WHERE i.type = 'Ligação Registrada') AS ligacoes,
                COUNT(i.id) FILTER (WHERE i.type = 'Ligação Registrada' AND i.observation LIKE 'CE%') AS ce,
                COUNT(DISTINCT i.client_id) FILTER (WHERE i.type = 'Ligação Registrada' AND i.observation LIKE 'CE%') AS tratativas,
                COUNT(DISTINCT i.client_id) FILTER (WHERE i.type = 'Mudança de Status' AND i.to_status = 'Doc Completa') AS documentacao,
                COUNT(DISTINCT i.client_id) FILTER (WHERE i.type = 'Mudança de Status' AND i.to_status = 'Venda Gerada') AS vendas
            FROM interactions i
            JOIN clients c ON i.client_id = c.id
            WHERE i.created_at BETWEEN $1 AND $2 ${userFilter} ${clientOwnerFilter}
            GROUP BY c.source
            ORDER BY c.source;
        `;

        // This query fetches brokers for the dropdown, it's not filtered by date/broker
        const brokersQuery = db.query("SELECT id, name FROM users WHERE role = 'BROKER' ORDER BY name");

        const [kpisRes, timeseriesRes, brokerBreakdownRes, originBreakdownRes, brokersRes] = await Promise.all([
            db.query(kpisQuery, params),
            db.query(timeseriesQuery, params),
            db.query(brokerBreakdownQuery, params),
            db.query(originBreakdownQuery, params),
            brokersQuery // This one has no params
        ]);

        const kpisData = kpisRes.rows[0] || {};
        const productivityKpis = {
            ligacoes: parseInt(kpisData.ligacoes || 0),
            ce: parseInt(kpisData.ce || 0),
            tratativas: parseInt(kpisData.tratativas || 0),
            documentacao: parseInt(kpisData.documentacao || 0),
            vendas: parseInt(kpisData.vendas || 0),
        };

        let managerKpis = null;
        if (req.user.role === 'MANAGER' || req.user.role === 'ADMIN') {
            const vgvParams = [startDate, endOfDay];
            let ownerFilter = '';
            if (targetBrokerId) {
                vgvParams.push(targetBrokerId);
                ownerFilter = `AND c.owner_id = $${vgvParams.length}`;
            }

            const vgvQuery = `
                SELECT COALESCE(SUM(c.property_value), 0) AS value
                FROM clients c
                WHERE c.id IN (
                    SELECT DISTINCT i.client_id FROM interactions i
                    WHERE i.created_at BETWEEN $1 AND $2
                    AND i.to_status = 'Venda Gerada'
                ) ${ownerFilter}
            `;
            
            const oportunidadeParams = [];
            let oportunidadeOwnerFilter = `WHERE c.status NOT IN ('Venda Gerada', 'Arquivado')`;
            if (targetBrokerId) {
                oportunidadeParams.push(targetBrokerId);
                oportunidadeOwnerFilter += ` AND c.owner_id = $1`;
            }
            const oportunidadeQuery = `
                SELECT COALESCE(SUM(c.property_value), 0) AS value
                FROM clients c ${oportunidadeOwnerFilter}
            `;
            
            const [vgvRes, oportunidadeRes] = await Promise.all([
                db.query(vgvQuery, vgvParams),
                db.query(oportunidadeQuery, oportunidadeParams)
            ]);
            
            managerKpis = {
                vgv: parseFloat(vgvRes.rows[0]?.value || 0),
                oportunidade: parseFloat(oportunidadeRes.rows[0]?.value || 0),
                ligacoes: productivityKpis.ligacoes,
                vendas: productivityKpis.vendas,
            };
        }

        const response = {
            kpis: productivityKpis,
            managerKpis,
            timeseries: { daily: convertObjectKeys(timeseriesRes.rows, snakeToCamel) },
            breakdown: {
                porOrigem: convertObjectKeys(originBreakdownRes.rows, snakeToCamel),
                porBroker: convertObjectKeys(brokerBreakdownRes.rows, snakeToCamel)
            },
            brokers: brokersRes.rows
        };

        res.status(200).json(response);
    } catch (error) {
        console.error('Error fetching productivity data:', error);
        res.status(500).json({ error: 'Erro ao buscar dados de produtividade.' });
    }
};

// GET /analytics/funnel
exports.getFunnelAnalyticsData = async (req, res) => {
    const { startDate, endDate, brokerId } = req.query;
    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required.' });
    }
     if (!req.user) {
        return res.status(401).json({ error: 'Sua sessão expirou ou é inválida. Por favor, faça o login novamente.' });
    }
    const endOfDay = `${endDate}T23:59:59.999Z`;

    const params = [startDate, endOfDay];
    let userFilter = '';
    
    // If logged in as BROKER, always filter by own ID.
    // If logged in as MANAGER/ADMIN, use the brokerId from query if provided.
    const targetBrokerId = req.user.role === 'BROKER' ? req.user.id : brokerId;

    if (targetBrokerId) {
        params.push(targetBrokerId);
        const paramIndex = params.length;
        userFilter = `AND i.user_id = $${paramIndex}`;
    }

    try {
        const funnelQuery = `
            WITH interaction_counts AS (
                SELECT
                    -- Distinct clients for actions that can happen multiple times for one sale
                    COUNT(DISTINCT i.client_id) FILTER (WHERE i.type = 'Mudança de Status' AND i.to_status = 'Venda Gerada') AS vendas,
                    COUNT(DISTINCT i.client_id) FILTER (WHERE i.type = 'Mudança de Status' AND i.to_status = 'Doc Completa') AS documentacao_completa,
                    -- Distinct clients that entered 'Tratativa'
                    COUNT(DISTINCT i.client_id) FILTER (WHERE i.to_status = 'Tratativa') AS tratativa,
                    -- Total CE calls
                    COUNT(i.id) FILTER (WHERE i.type = 'Ligação Registrada' AND i.observation LIKE 'CE%') AS ce,
                    -- Total calls made
                    COUNT(i.id) FILTER (WHERE i.type = 'Ligação Registrada') AS ligacoes
                FROM interactions i
                WHERE i.created_at BETWEEN $1 AND $2 ${userFilter}
            )
            SELECT unnest(array['Ligações', 'Contatos Efetivos (CE)', 'Tratativa', 'Documentação Completa', 'Vendas']) AS stage,
                   unnest(array[ligacoes, ce, tratativa, documentacao_completa, vendas]) AS count
            FROM interaction_counts;
        `;
        
        const funnelRes = await db.query(funnelQuery, params);
        const funnelData = funnelRes.rows.map(row => ({ ...row, count: parseInt(row.count || 0) }));

        const conversionRates = {}; // Calculation is complex and better handled on the client-side for simplicity.

        res.status(200).json({
            funnel: funnelData,
            conversionRates: conversionRates
        });
    } catch (error) {
        console.error('Error fetching funnel analytics:', error);
        res.status(500).json({ error: 'Erro ao buscar dados do funil.' });
    }
};