
const supabaseUrl = 'https://qxxyzamgwzfdftnncflz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4eHl6YW1nd3pmZGZ0bm5jZmx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTM3NDEsImV4cCI6MjA4NzE2OTc0MX0.YCO9K0dCD3-rgfIh7YPRYHfmlCCa6k4mZKNPlBvA-T4';

fetch(`${supabaseUrl}/rest/v1/audit_logs?limit=1`, {
    headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
    }
})
    .then(res => res.json())
    .then(data => console.log(JSON.stringify(data, null, 2)))
    .catch(console.error);
