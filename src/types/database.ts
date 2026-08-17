export type RoomStatus = 'WAITING' | 'IN_PROGRESS' | 'COMPLETED';

export interface Template {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
}

export interface Question {
  id: string;
  template_id: string | null;
  step_order: number;
  title: string;
  subtitle: string | null;
  created_at: string;
}

export interface Room {
  id: string;
  room_code: string;
  status: RoomStatus;
  template_id: string | null;
  current_question_id: string | null;
  created_at: string;
}

export interface Post {
  id: string;
  room_id: string;
  question_id: string;
  participant_token: string;
  author_name: string | null;
  content: string | null;
  image_url: string | null;
  is_selected: boolean;
  created_at: string;
  updated_at: string;
}