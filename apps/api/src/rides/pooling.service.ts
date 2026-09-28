import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Pool } from '../database/entities/pool.entity';
import { PoolStatus } from '../database/enums';

// Everything that changes who sits in a pool. It lives in RidesModule and is
// exported, so auto-join (rides) and driver accept (driver) share ONE
// seat-claiming path (ARCHITECTURE §1). Every method runs inside the caller's
// transaction: it takes the caller's EntityManager.
@Injectable()
export class PoolingService {
  // Takes `seats` seats in the pool if they are still free. Returns true if they
  // were claimed, false if not.
  //
  // Why one UPDATE and not "load the pool → seatsTaken += seats → save()": with
  // load-then-save, Nusrat and Shirin can both read "2 of 3 taken" before either
  // writes, and both write 3, so two people get one seat. Here the check and the
  // change are one statement. Postgres locks the row for the first UPDATE, makes
  // the second one wait until the first transaction commits, then re-checks the
  // WHERE against the new seats_taken: 3 + 1 > 3, so 0 rows change.
  //
  // It never throws for "no seat": 0 rows changed is a normal answer, not a SQL
  // error, and throwing would roll back the caller's transaction, losing the
  // passenger's brand-new request with it. (A real database error still throws.)
  async claimSeat(
    manager: EntityManager,
    poolId: string,
    seats: number,
  ): Promise<boolean> {
    const result = await manager
      .createQueryBuilder()
      .update(Pool)
      .set({ seatsTaken: () => 'seats_taken + :seats' })
      .where('id = :poolId', { poolId })
      // The driver hasn't arrived yet: nobody joins after that.
      .andWhere('status = :status', { status: PoolStatus.MATCHED })
      // Enough seats are still free.
      .andWhere('seats_taken + :seats <= capacity')
      .setParameters({ seats })
      .execute();

    return result.affected === 1;
  }
}
