import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { PageEntity } from './page.entity';

export enum BatchStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('batches')
export class BatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'simple-enum',
    enum: BatchStatus,
    default: BatchStatus.PENDING,
  })
  status: BatchStatus;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column('simple-json')
  seedUrls: string[];

  @OneToMany(() => PageEntity, (page) => page.batch)
  pages: PageEntity[];
}
