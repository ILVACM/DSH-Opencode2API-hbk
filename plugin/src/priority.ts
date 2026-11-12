export class UserActivity {
  private active = 0

  enter(): void {
    this.active += 1
  }

  leave(): void {
    if (this.active > 0) this.active -= 1
  }

  get isActive(): boolean {
    return this.active > 0
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}