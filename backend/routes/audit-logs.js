const router = require('express').Router();
const pool   = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

// All routes require admin. Unauthenticated -> 401, non-admin -> 403.
// No PUT/PATCH/DELETE routes — audit logs are append-only.

router.get('/', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { date_from, date_to, actor_user_id, action_type, entity_type, personnel_name, batch_number, sort = 'occurred_at_desc' } = req.query;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const conditions = []; const params = []; let idx = 1;
    if (date_from)      { conditions.push('al.occurred_at >= $' + idx++); params.push(date_from); }
    if (date_to)        { conditions.push('al.occurred_at <= $' + idx++); params.push(date_to + 'T23:59:59Z'); }
    if (actor_user_id)  { conditions.push('al.actor_user_id = $' + idx++); params.push(actor_user_id); }
    if (action_type)    { conditions.push('al.action_type = $' + idx++); params.push(action_type.toUpperCase()); }
    if (entity_type)    { conditions.push('al.entity_type = $' + idx++); params.push(entity_type); }
    if (personnel_name) { conditions.push('al.personnel_name ILIKE $' + idx++); params.push('%' + personnel_name + '%'); }
    if (batch_number)   { conditions.push('al.batch_number ILIKE $' + idx++); params.push('%' + batch_number + '%'); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const ORDER_MAP = { occurred_at_desc: 'al.occurred_at DESC', occurred_at_asc: 'al.occurred_at ASC', actor: 'al.actor_name ASC', action_type: 'al.action_type ASC', entity_type: 'al.entity_type ASC' };
    const orderBy = ORDER_MAP[sort] || 'al.occurred_at DESC';
    const countRes = await pool.query('SELECT COUNT(*)::int AS total FROM audit_logs al ' + where, params);
    const total = countRes.rows[0].total;
    const dataRes = await pool.query(
      'SELECT al.id, al.action_type, al.entity_type, al.entity_id, al.actor_user_id, al.actor_name, al.actor_email, al.actor_role, al.occurred_at, al.deletion_reason, al.personnel_name, al.batch_number, al.date_of_batch, al.changed_fields FROM audit_logs al ' + where + ' ORDER BY ' + orderBy + ' LIMIT $' + idx++ + ' OFFSET $' + idx++,
      [...params, limit, offset]
    );
    res.json({ logs: dataRes.rows, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) { console.error('[audit-logs] GET error:', err); res.status(500).json({ message: 'Server error' }); }
});

router.get('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM audit_logs WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Audit event not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error('[audit-logs] GET /:id error:', err); res.status(500).json({ message: 'Server error' }); }
});

router.put(   '/:id', (_req, res) => res.status(405).json({ message: 'Audit logs are immutable.' }));
router.patch( '/:id', (_req, res) => res.status(405).json({ message: 'Audit logs are immutable.' }));
router.delete('/:id', (_req, res) => res.status(405).json({ message: 'Audit logs are immutable.' }));

module.exports = router;
