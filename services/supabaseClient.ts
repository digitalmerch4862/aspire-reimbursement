import { createClient } from '@supabase/supabase-js';

// Credentials provided for the project
const SUPABASE_URL = 'https://hbohvskvyiagqxyiofzn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhib2h2c2t2eWlhZ3F4eWlvZnpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjY0MDgsImV4cCI6MjA4Njc0MjQwOH0.2pBiXK1CF-MHXO8ZHai9owJ4yPihGMU_gOQc53Me3D0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
