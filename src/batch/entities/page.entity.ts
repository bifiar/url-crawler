import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BatchEntity } from './batch.entity';
import { PageContentEntity } from './page-content.entity';

@Entity('pages')
@Index(['batch', 'url'], { unique: true })
export class PageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => BatchEntity, (batch) => batch.pages, { onDelete: 'CASCADE' })
  batch: BatchEntity;

  @Column()
  url: string;

  @Column()
  depth: number;

  @Column({ type: 'integer', nullable: true })
  statusCode: number | null;

  @Column('simple-json')
  links: string[];

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'integer', nullable: true })
  durationMs: number | null;

  @Column({ default: false })
  hasContent: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @OneToOne(() => PageContentEntity, (content) => content.page, {
    cascade: true,
  })
  @JoinColumn()
  content: PageContentEntity;
}
