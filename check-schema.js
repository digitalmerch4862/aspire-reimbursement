
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hbohvskvyiagqxyiofzn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhib2h2c2t2eWlhZ3F4eWlvZnpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjY0MDgsImV4cCI6MjA4Njc0MjQwOH0.2pBiXK1CF-MHXO8ZHai9owJ4yPihGMU_gOQc53Me3D0';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkMaxId() {
    const { data, error } = await supabase
        .from('audit_logs')
        .select('id')
        .order('id', { ascending: false })
        .limit(1);

    if (error) {
        console.error("Select Error:", JSON.stringify(error, null, 2));
    } else {
        console.log("Max ID Data:", JSON.stringify(data, null, 2));
    }
}

checkMaxId();
