import { ParticipantError } from '../services/participants.js';

export function createParticipantControllers(service, key, label) {
  const handle = (operation, status = 200) => async (request, response, next) => {
    try {
      const result = await operation(request);
      if (status === 204) response.status(204).end();
      else response.status(status).json(result);
    } catch (error) {
      if (error instanceof ParticipantError) {
        response.status(error.status).json({ error: error.message });
      } else if (error?.code === '23505') {
        response.status(409).json({ error: `${label} name already exists in this parent` });
      } else if (error?.code === '23503') {
        response.status(409).json({ error: request.method === 'DELETE'
          ? `${label} is referenced by dependent records`
          : 'Related records changed; retry with valid parent IDs' });
      } else {
        next(error);
      }
    }
  };
  return {
    create: handle(async (r) => ({ [key]: await service.create(r.params, r.body, r.auth.uid) }), 201),
    list: handle(async (r) => ({ [`${key}s`]: await service.list(r.params) })),
    get: handle(async (r) => ({ [key]: await service.get(r.params) })),
    update: handle(async (r) => ({ [key]: await service.update(r.params, r.body, r.auth.uid) })),
    remove: handle((r) => service.remove(r.params, r.auth.uid), 204),
  };
}
