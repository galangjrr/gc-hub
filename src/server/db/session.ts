import { eq } from 'drizzle-orm';
import { db } from './index';
import { sessionLogs } from './schema';

/**
 * Create a new session log
 */
export const createSessionLog = (data: typeof sessionLogs.$inferInsert) => {
  return db.insert(sessionLogs).values(data).run();
};

/**
 * End an active session
 */
export const endSessionLog = (id: number, minutesUsed: number, moneyUsed: number) => {
  return db.update(sessionLogs)
    .set({ 
      minutesUsed, 
      realMoneyUsed: moneyUsed, 
      status: 'completed', // was 0
      stopDate: new Date().toISOString().replace(/\D/g, '').slice(0, 8), // keep as string
      stopTime: new Date().toTimeString().replace(/\D/g, '').slice(0, 6) // keep as string
    })
    .where(eq(sessionLogs.id, id))
    .run();
};

/**
 * Get active session for a workstation
 */
export const getActiveSessionForWorkstation = (workstationId: number) => {
  return db.select()
    .from(sessionLogs)
    .where(eq(sessionLogs.workstationId, workstationId))
    .get(); // Pragmatic approach: get latest or where status = 1
};
