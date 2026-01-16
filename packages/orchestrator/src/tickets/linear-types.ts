export type LinearState = {
  id: string;
  name: string;
  type?: string | null;
};

export type LinearIssueLink = {
  issueId: string;
  identifier?: string;
  url?: string;
};
