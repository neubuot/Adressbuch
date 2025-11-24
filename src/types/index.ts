export interface Contact {
  id: number;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  createdAt: string;
}

export interface Message {
  id: number;
  recipientId: number;
  recipientName: string;
  text: string;
  type: 'sent' | 'received';
  timestamp: string;
  read: boolean;
}

export type MessageFilter = 'all' | 'sent' | 'received';

export type TabName = 'contacts' | 'messages';

export interface AppData {
  contacts: Contact[];
  messages: Message[];
  exportedAt: string;
}
