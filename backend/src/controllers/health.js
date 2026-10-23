import { getHealthStatus } from '../services/health.js';

export function getHealth(_request, response) {
  response.json(getHealthStatus());
}
