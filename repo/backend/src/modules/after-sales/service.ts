import { NotFoundError, UnprocessableError } from '../../common/errors/app-errors.js';
import {
  TicketPriority,
  CompensationTriggerType,
  TicketType,
  TicketStatus,
  capCompensation,
  remainingCompensationBudget,
  DEFAULT_COMPENSATION_CAP,
} from './types.js';
import type { CreateTicketRequest } from './types.js';
import * as repo from './repository.js';

// SLA hours by priority
const SLA_HOURS: Record<string, number> = {
  [TicketPriority.URGENT]: 4,
  [TicketPriority.HIGH]: 8,
  [TicketPriority.MEDIUM]: 24,
  [TicketPriority.LOW]: 72,
};

// Map ticket type to compensation trigger type
const TICKET_TO_TRIGGER: Record<string, string> = {
  [TicketType.DELAY]: CompensationTriggerType.DELIVERY_LATE_48H,
  [TicketType.LOST_ITEM]: CompensationTriggerType.LOST_ITEM,
  [TicketType.DISPUTE]: CompensationTriggerType.DAMAGED_ITEM,
};

// ---- Ticket ----

export async function createTicket(orgId: string, userId: string, data: CreateTicketRequest) {
  if (data.shipmentId) {
    const shipment = await repo.findShipmentOrgById(data.shipmentId);
    if (!shipment || shipment.warehouse.orgId !== orgId) {
      throw new NotFoundError('Shipment not found');
    }
  }

  if (data.parcelId) {
    const parcel = await repo.findParcelWithShipmentOrgById(data.parcelId);
    if (!parcel || parcel.shipment.warehouse.orgId !== orgId) {
      throw new NotFoundError('Parcel not found');
    }
    if (data.shipmentId && parcel.shipmentId !== data.shipmentId) {
      throw new NotFoundError('Parcel not found');
    }
  }

  const slaHours = SLA_HOURS[data.priority ?? TicketPriority.MEDIUM];
  const slaDeadlineAt = new Date(Date.now() + slaHours * 60 * 60 * 1000);

  return repo.createTicket({
    orgId,
    createdByUserId: userId,
    type: data.type,
    shipmentId: data.shipmentId,
    parcelId: data.parcelId,
    priority: data.priority ?? TicketPriority.MEDIUM,
    slaDeadlineAt,
    description: data.description,
  });
}

// ---- Evidence ----

export async function addEvidence(
  ticketId: string,
  fileAssetId: string,
  uploadedByUserId: string,
  description?: string,
) {
  const ticket = await repo.findTicketById(ticketId);
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (ticket.status === TicketStatus.CLOSED) {
    throw new UnprocessableError('Cannot add evidence to a closed ticket');
  }

  return repo.addEvidence({ ticketId, fileAssetId, uploadedByUserId, description });
}

// ---- Compensation suggestion ----

export async function suggestCompensation(ticketId: string, orgId: string, requestedByUserId: string) {
  const ticket = await repo.findTicketById(ticketId);
  if (!ticket) throw new NotFoundError('Ticket not found');

  const triggerType = TICKET_TO_TRIGGER[ticket.type];
  if (!triggerType) {
    throw new UnprocessableError(`No compensation trigger defined for ticket type '${ticket.type}'`);
  }

  const policies = await repo.findActivePolicies(orgId, triggerType);
  if (policies.length === 0) {
    throw new NotFoundError(`No active compensation policy found for trigger '${triggerType}'`);
  }

  const policy = policies[0];
  const policyAmount = parseFloat(policy.compensationAmount.toString());
  const capPerTicket = parseFloat(policy.maxCapPerTicket.toString());
  const approvedTotal = await repo.findApprovedSuggestionsTotal(ticketId);

  const capped = capCompensation(policyAmount, approvedTotal, capPerTicket);
  if (capped <= 0) {
    throw new UnprocessableError('Compensation cap has been reached for this ticket');
  }

  const suggestion = await repo.createSuggestion({
    ticketId,
    policyId: policy.id,
    suggestedAmount: capped,
    reason: `Automated suggestion based on policy: ${triggerType}. Policy amount: $${policyAmount.toFixed(2)}, capped at $${capped.toFixed(2)}`,
    createdByUserId: requestedByUserId,
  });

  return suggestion;
}

// ---- Compensation approval ----

export async function approveCompensation(
  suggestionId: string,
  approvedByUserId: string,
  decision: string,
  notes?: string,
) {
  const suggestion = await repo.findSuggestionById(suggestionId);
  if (!suggestion) throw new NotFoundError('Compensation suggestion not found');
  if (suggestion.status !== 'pending') {
    throw new UnprocessableError(`Cannot approve suggestion with status '${suggestion.status}'`);
  }

  if (decision === 'approved') {
    const approvedTotal = await repo.findApprovedSuggestionsTotal(suggestion.ticketId);
    const suggestedAmount = parseFloat(suggestion.suggestedAmount.toString());
    const remaining = remainingCompensationBudget(approvedTotal, DEFAULT_COMPENSATION_CAP);
    if (suggestedAmount > remaining) {
      throw new UnprocessableError(
        `Approval would exceed the per-ticket compensation cap. Remaining budget: $${remaining.toFixed(2)}`,
      );
    }
  }

  return repo.createApproval({ suggestionId, approvedByUserId, decision, notes });
}
