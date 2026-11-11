/** One replacement the rebooking agent proposes for an activity that couldn't be booked. Not booked, not charged. */
export type RebookSuggestion = {
  /** The refunded activity whose slot this would fill. */
  forOfferId: string;
  forTitle: string;
  refundMinorUnits: number;
  /** The agent's one-line reason, for the traveller. */
  reason: string;
  offer: {
    id: string;
    title: string;
    summary: string;
    startsAt: string;
    endsAt: string;
    costMinorUnits: number;
    platform: string;
    synthetic: boolean;
  };
};

export type RebookResponse = { suggestions: RebookSuggestion[]; note: string };
