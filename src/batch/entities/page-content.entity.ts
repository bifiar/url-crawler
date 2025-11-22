import { Entity, PrimaryGeneratedColumn, Column, OneToOne } from 'typeorm';
import { PageEntity } from './page.entity';

@Entity('page_contents')
export class PageContentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => PageEntity, (page) => page.content, { onDelete: 'CASCADE' })
  page: PageEntity;

  @Column({ type: 'blob' })
  compressedContent: Buffer;

  @Column()
  contentHash: string;

  @Column()
  originalSize: number;

  @Column()
  compressedSize: number;
}
