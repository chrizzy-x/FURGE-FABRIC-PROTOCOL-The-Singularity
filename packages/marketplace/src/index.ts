import { createMoney, makeId, nowIso, type ListingMode, type MarketplaceListing, type MarketplaceTransaction, type SkillCertification } from "@furge/shared-types";
import { TokenLedger } from "@furge/tokenomics";

export class MarketplaceService {
  private readonly skills = new Map<string, SkillCertification>();
  private readonly listings = new Map<string, MarketplaceListing>();
  private readonly transactions: MarketplaceTransaction[] = [];

  constructor(private readonly ledger: TokenLedger, seedSkills: SkillCertification[] = [], seedListings: MarketplaceListing[] = [], seedTransactions: MarketplaceTransaction[] = []) {
    seedSkills.forEach((skill) => this.skills.set(skill.id, skill));
    seedListings.forEach((listing) => this.listings.set(listing.id, listing));
    this.transactions.push(...seedTransactions);
  }

  certify(skill: Omit<SkillCertification, "id" | "certifiedAt">): SkillCertification {
    const certification: SkillCertification = {
      ...skill,
      id: makeId("skill", `${skill.ownerAgentId}:${skill.chain}:${skill.capability}`),
      certifiedAt: nowIso()
    };
    this.skills.set(certification.id, certification);
    return certification;
  }

  listSkill(input: { skillId: string; sellerId: string; chain: SkillCertification["chain"]; mode: ListingMode; amount: number; token: string; terms: string }): MarketplaceListing {
    const listing: MarketplaceListing = {
      id: makeId("listing", `${input.skillId}:${input.sellerId}:${this.listings.size}`),
      skillId: input.skillId,
      sellerId: input.sellerId,
      chain: input.chain,
      mode: input.mode,
      price: createMoney(input.token, input.amount),
      terms: input.terms,
      active: true,
      createdAt: nowIso()
    };
    this.listings.set(listing.id, listing);
    return listing;
  }

  purchase(listingId: string, buyerId: string): MarketplaceTransaction {
    const listing = this.listings.get(listingId);
    if (!listing || !listing.active) {
      throw new Error(`Listing ${listingId} is not available`);
    }

    listing.active = false;
    this.ledger.transfer({
      chain: listing.chain,
      payerId: buyerId,
      payeeId: listing.sellerId,
      token: listing.price.token,
      amount: listing.price.amount,
      kind: "marketplace"
    });

    const transaction: MarketplaceTransaction = {
      id: makeId("marketplace-tx", `${listingId}:${buyerId}:${this.transactions.length}`),
      listingId,
      buyerId,
      sellerId: listing.sellerId,
      token: listing.price.token,
      amount: listing.price.amount,
      mode: listing.mode,
      completedAt: nowIso()
    };
    this.transactions.push(transaction);
    return transaction;
  }

  getSkills(): SkillCertification[] {
    return Array.from(this.skills.values());
  }

  getListings(): MarketplaceListing[] {
    return Array.from(this.listings.values());
  }

  getTransactions(): MarketplaceTransaction[] {
    return [...this.transactions];
  }
}