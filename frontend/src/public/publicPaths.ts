export const resultsPath = (id: string) => `/competitions/${encodeURIComponent(id)}/results`;
export const categoryPath = (competitionId: string, categoryId: string) => `${resultsPath(competitionId)}/categories/${encodeURIComponent(categoryId)}`;
export const eventPath = (competitionId: string, categoryId: string, eventId: string) => `${categoryPath(competitionId, categoryId)}/events/${encodeURIComponent(eventId)}`;
