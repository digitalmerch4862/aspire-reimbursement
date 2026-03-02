
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const SUPABASE_URL = urlMatch ? urlMatch[1].trim() : '';
const SUPABASE_ANON_KEY = keyMatch ? keyMatch[1].trim() : '';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testConnection() {
    console.log("Testing connection to:", SUPABASE_URL);
    const { data, error } = await supabase.from('audit_logs').select('*', { count: 'exact', head: true });
    if (error) {
        console.error("Connection Error:", JSON.stringify(error, null, 2));
    } else {
        console.log("Connection Success! Row count:", data);
    }
}

testConnection();
