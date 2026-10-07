import { eq } from 'drizzle-orm';
import { db } from './index';
import { userAccounts } from './schema';

/**
 * Get member detail by username
 */
export const getMemberByUsername = (username: string) => {
  return db.select().from(userAccounts).where(eq(userAccounts.name, username)).get();
};

/**
 * Deduct member balance
 */
export const deductMemberBalance = (id: number, amount: number) => {
  const member = db.select().from(userAccounts).where(eq(userAccounts.id, id)).get();
  if (!member) throw new Error('Member not found');
  if (member.money! < amount) throw new Error('Insufficient balance');

  return db.update(userAccounts)
    .set({ 
      money: member.money! - amount,
      usedAmount: member.usedAmount! + amount 
    })
    .where(eq(userAccounts.id, id))
    .run();
};

/**
 * Create a new member (for seeding/testing)
 */
export const createMember = (name: string, money: number = 0, passwordHash: string = '') => {
  return db.insert(userAccounts).values({
    name,
    money,
    passwordHash,
    groupId: 1 // Default group
  }).run();
};
