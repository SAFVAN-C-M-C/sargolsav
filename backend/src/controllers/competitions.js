import { CompetitionError, createCompetitionService } from '../services/competitions.js';

export function createCompetitionControllers(service = createCompetitionService()) {
  const handle = (operation, status = 200) => async (request, response, next) => {
    try {
      const result = await operation(request);
      response.status(status).json(result);
    } catch (error) {
      if (error instanceof CompetitionError) {
        response.status(error.status).json({ error: error.message });
      } else if (error?.code === '23505') {
        response.status(409).json({ error: 'Competition code already exists' });
      } else {
        next(error);
      }
    }
  };
  return {
    create: handle(async (r) => ({ competition: await service.create(r.body, r.auth.uid) }), 201),
    list: handle(async () => ({ competitions: await service.list() })),
    get: handle(async (r) => ({ competition: await service.get(r.params.id) })),
    update: handle(async (r) => ({ competition: await service.update(r.params.id, r.body, r.auth.uid) })),
    updateStatus: handle(async (r) => ({ competition: await service.updateStatus(r.params.id, r.body, r.auth.uid) })),
    getSettings: handle(async (r) => ({ settings: await service.getSettings(r.params.id) })),
    updateSettings: handle(async (r) => ({ settings: await service.updateSettings(r.params.id, r.body, r.auth.uid) })),
  };
}
