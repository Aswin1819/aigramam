/**
 * Pixel Engine - Canvas-based pixel art rendering system
 * Supports character animations, office layout, and real-time state updates
 * Design Philosophy: Retro pixel punk with neon colors and strict grid alignment
 */

export interface Position {
  x: number;
  y: number;
}

export interface AgentState {
  id: string;
  name: string;
  position: Position;
  direction: 'up' | 'down' | 'left' | 'right';
  state: 'idle' | 'walking' | 'typing' | 'thinking' | 'waiting';
  color: string;
  animationFrame: number;
}

export interface OfficeLayout {
  width: number;
  height: number;
  backgroundColor: string;
  gridColor: string;
  showGrid: boolean;
}

export class PixelEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private pixelSize: number = 16; // 16x16 pixel grid
  private agents: Map<string, AgentState> = new Map();
  private layout: OfficeLayout;
  private animationId: number | null = null;
  private frameCount: number = 0;

  constructor(canvas: HTMLCanvasElement, layout: OfficeLayout) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.layout = layout;
    this.setupCanvas();
  }

  private setupCanvas(): void {
    // Disable image smoothing for crisp pixel art
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.imageSmoothingQuality = 'high';
  }

  /**
   * Render a single frame
   */
  public render(): void {
    this.frameCount++;
    
    // Clear canvas
    this.ctx.fillStyle = this.layout.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw grid if enabled
    if (this.layout.showGrid) {
      this.drawGrid();
    }

    // Draw all agents
    this.agents.forEach((agent) => {
      this.drawAgent(agent);
    });

    // Draw scanlines effect
    this.drawScanlines();
  }

  /**
   * Draw grid background
   */
  private drawGrid(): void {
    this.ctx.strokeStyle = this.layout.gridColor;
    this.ctx.globalAlpha = 0.1;
    this.ctx.lineWidth = 1;

    // Vertical lines
    for (let x = 0; x < this.canvas.width; x += this.pixelSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvas.height);
      this.ctx.stroke();
    }

    // Horizontal lines
    for (let y = 0; y < this.canvas.height; y += this.pixelSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.canvas.width, y);
      this.ctx.stroke();
    }

    this.ctx.globalAlpha = 1;
  }

  /**
   * Draw scanlines effect
   */
  private drawScanlines(): void {
    this.ctx.strokeStyle = '#00FF41';
    this.ctx.globalAlpha = 0.02;
    this.ctx.lineWidth = 1;

    for (let y = 0; y < this.canvas.height; y += 2) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.canvas.width, y);
      this.ctx.stroke();
    }

    this.ctx.globalAlpha = 1;
  }

  /**
   * Draw an agent character
   */
  private drawAgent(agent: AgentState): void {
    const screenX = agent.position.x * this.pixelSize;
    const screenY = agent.position.y * this.pixelSize;
    const size = this.pixelSize;

    // Draw character body (simplified pixel art)
    this.ctx.fillStyle = agent.color;
    this.ctx.fillRect(screenX + 2, screenY + 2, size - 4, size - 4);

    // Draw eyes based on direction
    this.ctx.fillStyle = '#000000';
    const eyeSize = 2;
    
    switch (agent.direction) {
      case 'up':
        this.ctx.fillRect(screenX + 4, screenY + 4, eyeSize, eyeSize);
        this.ctx.fillRect(screenX + 10, screenY + 4, eyeSize, eyeSize);
        break;
      case 'down':
        this.ctx.fillRect(screenX + 4, screenY + 10, eyeSize, eyeSize);
        this.ctx.fillRect(screenX + 10, screenY + 10, eyeSize, eyeSize);
        break;
      case 'left':
        this.ctx.fillRect(screenX + 4, screenY + 6, eyeSize, eyeSize);
        this.ctx.fillRect(screenX + 4, screenY + 10, eyeSize, eyeSize);
        break;
      case 'right':
        this.ctx.fillRect(screenX + 10, screenY + 6, eyeSize, eyeSize);
        this.ctx.fillRect(screenX + 10, screenY + 10, eyeSize, eyeSize);
        break;
    }

    // Draw state indicator
    this.drawStateIndicator(agent, screenX, screenY, size);
  }

  /**
   * Draw state indicator (typing, thinking, waiting)
   */
  private drawStateIndicator(agent: AgentState, x: number, y: number, size: number): void {
    const indicatorY = y - 8;

    switch (agent.state) {
      case 'typing':
        // Draw code brackets
        this.ctx.fillStyle = '#00D9FF';
        this.ctx.font = 'bold 8px monospace';
        this.ctx.fillText('< >', x + 2, indicatorY);
        break;
      case 'thinking':
        // Draw question mark
        this.ctx.fillStyle = '#FF00FF';
        this.ctx.font = 'bold 8px monospace';
        this.ctx.fillText('?', x + 6, indicatorY);
        break;
      case 'waiting':
        // Draw exclamation mark
        this.ctx.fillStyle = '#FFD700';
        this.ctx.font = 'bold 8px monospace';
        this.ctx.fillText('!', x + 6, indicatorY);
        break;
    }
  }

  /**
   * Add or update an agent
   */
  public addAgent(agent: AgentState): void {
    this.agents.set(agent.id, agent);
  }

  /**
   * Remove an agent
   */
  public removeAgent(id: string): void {
    this.agents.delete(id);
  }

  /**
   * Update agent state
   */
  public updateAgent(id: string, updates: Partial<AgentState>): void {
    const agent = this.agents.get(id);
    if (agent) {
      this.agents.set(id, { ...agent, ...updates });
    }
  }

  /**
   * Move agent to position
   */
  public moveAgent(id: string, targetX: number, targetY: number): void {
    const agent = this.agents.get(id);
    if (agent) {
      agent.position = { x: targetX, y: targetY };
      agent.state = 'walking';
      agent.animationFrame = (agent.animationFrame + 1) % 4;
    }
  }

  /**
   * Get all agents
   */
  public getAgents(): AgentState[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get frame count for animation timing
   */
  public getFrameCount(): number {
    return this.frameCount;
  }

  /**
   * Resize canvas
   */
  public resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
  }
}
