export type TradeType = 'Mason' | 'Helper' | 'Carpenter' | 'Plumber' | 'Electrician' | 'Painter' | 'Welder' | 'Other';
export type AttendanceStatus = 'Present' | 'Absent' | 'Half Day';
export type UserRole = 'Admin' | 'Engineer';

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
          full_name: string | null;
          role: UserRole;
          site_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: UserRole;
          site_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          role?: UserRole;
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
      site_engineers: {
        Row: {
          site_id: string;
          engineer_id: string;
          assigned_by: string | null;
          assigned_at: string;
        };
        Insert: {
          site_id: string;
          engineer_id: string;
          assigned_by?: string | null;
          assigned_at?: string;
        };
        Update: {
          site_id?: string;
          engineer_id?: string;
          assigned_by?: string | null;
          assigned_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "site_engineers_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "site_engineers_engineer_id_fkey";
            columns: ["engineer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
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
      user_role: UserRole;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
