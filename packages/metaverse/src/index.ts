import { makeId, nowIso, type MetaverseProfile, type MetaverseSession, type PresenceUpdateRequest } from "@furge/shared-types";

export class MetaverseService {
  private readonly profiles = new Map<string, MetaverseProfile>();
  private readonly sessions: MetaverseSession[] = [];

  constructor(seedProfiles: MetaverseProfile[] = [], seedSessions: MetaverseSession[] = []) {
    seedProfiles.forEach((profile) => this.profiles.set(profile.agentId, profile));
    this.sessions.push(...seedSessions);
  }

  updatePresence(request: PresenceUpdateRequest): MetaverseSession {
    const profile = this.profiles.get(request.agentId);
    if (!profile) {
      throw new Error(`Metaverse profile ${request.agentId} was not found`);
    }

    const updatedProfile: MetaverseProfile = {
      ...profile,
      currentScene: request.scene,
      mode: request.mode,
      device: request.device,
      presenceState: request.mode === "review" ? "review" : "active",
      updatedAt: nowIso()
    };
    this.profiles.set(request.agentId, updatedProfile);

    const session: MetaverseSession = {
      id: makeId("session", `${request.agentId}:${request.scene}:${request.mode}:${this.sessions.length}`),
      agentId: request.agentId,
      chain: profile.chain,
      scene: request.scene,
      mode: request.mode,
      approved: request.approved,
      notes: request.notes,
      startedAt: nowIso()
    };
    this.sessions.push(session);
    return session;
  }

  getProfiles(): MetaverseProfile[] {
    return Array.from(this.profiles.values());
  }

  getSessions(): MetaverseSession[] {
    return [...this.sessions];
  }
}