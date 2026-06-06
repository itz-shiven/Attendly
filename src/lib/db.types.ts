export type TradeType = 'Mason' | 'Helper' | 'Carpenter' | 'Plumber' | 'Electrician' | 'Painter' | 'Welder' | 'Other';
export type AttendanceStatus = 'Present' | 'Absent' | 'Half Day';

export interface Database {
  public: {
    Tables: {
      sites: {
        Row: {
          id: string;
          name: string;
          location: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          location?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          location?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          site_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          site_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          site_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          }
        ];
      };
      laborers: {
        Row: {
          id: string;
          name: string;
          mobile: string;
          aadhaar: string;
          pan: string;
          trade: TradeType;
          photo_url: string | null;
          site_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          mobile: string;
          aadhaar: string;
          pan: string;
          trade?: TradeType;
          photo_url?: string | null;
          site_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          mobile?: string;
          aadhaar?: string;
          pan?: string;
          trade?: TradeType;
          photo_url?: string | null;
          site_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "laborers_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          }
        ];
      };
      attendance: {
        Row: {
          date: string;
          laborer_id: string;
          status: AttendanceStatus;
          marked_by: string;
          marked_at: string;
          site_id: string;
        };
        Insert: {
          date?: string;
          laborer_id: string;
          status?: AttendanceStatus;
          marked_by: string;
          marked_at?: string;
          site_id: string;
        };
        Update: {
          date?: string;
          laborer_id?: string;
          status?: AttendanceStatus;
          marked_by?: string;
          marked_at?: string;
          site_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_laborer_id_fkey";
            columns: ["laborer_id"];
            isOneToOne: false;
            referencedRelation: "laborers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_marked_by_fkey";
            columns: ["marked_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      trade_type: TradeType;
      attendance_status: AttendanceStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
