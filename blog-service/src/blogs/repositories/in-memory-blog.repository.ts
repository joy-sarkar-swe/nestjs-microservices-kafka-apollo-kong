import { Injectable } from '@nestjs/common';
import { Blog } from '../entities/blog.entity';
import { BlogRepository } from './blog.repository.interface';

/**
 * @repository InMemoryBlogRepository
 * @implements BlogRepository
 * @description Concrete in-memory implementation of BlogRepository.
 *
 * Storage: Map<string, Blog> — keyed by UUID.
 * State is lost on process restart (acceptable for demo/lecture).
 *
 * Upgrade path
 * ────────────
 * Create PrismaBlogRepository implementing BlogRepository, then:
 *   { provide: 'BLOG_REPOSITORY', useClass: PrismaBlogRepository }
 * in BlogsModule. BlogsService requires zero changes.
 */
@Injectable()
export class InMemoryBlogRepository implements BlogRepository {
  private readonly store: Map<string, Blog> = new Map();

  async create(blog: Blog): Promise<Blog> {
    this.store.set(blog.id, blog);
    return blog;
  }

  async findById(id: string): Promise<Blog | null> {
    return this.store.get(id) ?? null;
  }

  async findAll(): Promise<Blog[]> {
    return Array.from(this.store.values());
  }

  async findByAuthorId(authorId: string): Promise<Blog[]> {
    return Array.from(this.store.values()).filter((b) => b.authorId === authorId);
  }

  async update(id: string, data: Partial<Pick<Blog, 'title' | 'content'>>): Promise<Blog> {
    const existing = this.store.get(id);
    if (!existing) {
      throw new Error(`InMemoryBlogRepository: Blog "${id}" not found during update`);
    }
    const updated: Blog = { ...existing, ...data };
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
