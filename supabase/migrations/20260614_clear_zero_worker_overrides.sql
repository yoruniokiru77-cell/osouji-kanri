update public.reservation_workers rw
set compensation_type = null,
    compensation_value = null
from public.workers w
where w.id = rw.worker_id
  and rw.compensation_type = 'fixed'
  and coalesce(rw.compensation_value, 0) = 0
  and w.default_compensation_value > 0;
