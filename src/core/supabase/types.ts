export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      annotations: {
        Row: {
          anchor: NonNullable<Json>;
          body: string | null;
          color_id: number | null;
          created_at: string;
          deleted_at: string | null;
          document_id: string;
          id: string;
          kind: Database['public']['Enums']['annotation_kind'];
          label: string | null;
          page: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          anchor: NonNullable<Json>;
          body?: string | null;
          color_id?: number | null;
          created_at?: string;
          deleted_at?: string | null;
          document_id: string;
          id: string;
          kind: Database['public']['Enums']['annotation_kind'];
          label?: string | null;
          page: number;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          anchor?: NonNullable<Json>;
          body?: string | null;
          color_id?: number | null;
          created_at?: string;
          deleted_at?: string | null;
          document_id?: string;
          id?: string;
          kind?: Database['public']['Enums']['annotation_kind'];
          label?: string | null;
          page?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'annotations_document_fk';
            columns: ['document_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'documents';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      documents: {
        Row: {
          author: string | null;
          content_hash: string;
          cover_path: string | null;
          created_at: string;
          deleted_at: string | null;
          file_size: number;
          id: string;
          last_opened_at: string | null;
          page_count: number;
          storage_mode: Database['public']['Enums']['doc_storage_mode'];
          storage_path: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          author?: string | null;
          content_hash: string;
          cover_path?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          file_size: number;
          id: string;
          last_opened_at?: string | null;
          page_count: number;
          storage_mode?: Database['public']['Enums']['doc_storage_mode'];
          storage_path?: string | null;
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          author?: string | null;
          content_hash?: string;
          cover_path?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          file_size?: number;
          id?: string;
          last_opened_at?: string | null;
          page_count?: number;
          storage_mode?: Database['public']['Enums']['doc_storage_mode'];
          storage_path?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
          settings: NonNullable<Json>;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id: string;
          settings?: NonNullable<Json>;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          settings?: NonNullable<Json>;
          updated_at?: string;
        };
        Relationships: [];
      };
      reading_positions: {
        Row: {
          anchor: Json | null;
          device_id: string;
          device_label: string | null;
          document_id: string;
          page: number;
          progress: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          anchor?: Json | null;
          device_id: string;
          device_label?: string | null;
          document_id: string;
          page: number;
          progress: number;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          anchor?: Json | null;
          device_id?: string;
          device_label?: string | null;
          document_id?: string;
          page?: number;
          progress?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reading_positions_document_fk';
            columns: ['document_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'documents';
            referencedColumns: ['id', 'user_id'];
          },
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
      annotation_kind: 'highlight' | 'note' | 'bookmark';
      doc_storage_mode: 'cloud' | 'device';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema['Tables'] & DefaultSchema['Views']) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      annotation_kind: ['highlight', 'note', 'bookmark'],
      doc_storage_mode: ['cloud', 'device'],
    },
  },
} as const;
