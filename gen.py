f = open("C:/Users/Admin/Desktop/App/Aspire Reimbursement/audit_full.js", "w")
f.write("const fs = require("fs");
")
f.write("const https = require("https");
")
f.write("const { chromium } = require("playwright");
")
f.write("const { simpleParser } = require("mailparser");
")
f.write("const mammoth = require("mammoth");
")
f.write("
")
f.write("const TOKEN = JSON.parse(fs.readFileSync("ms_token_clean.json", "utf-8").replace(/^￿/, "").trim());
")
f.write("const CSV = "C:/Users/Admin/Documents/Claude/Projects/aspirehomes/Reimbursement_Audit_Sample.csv";
")
f.write("const TURNOVER = "C:/Users/Admin/Desktop/App/Aspire Reimbursement/TURNOVER.md";
")
f.write("const APP = "http://localhost:3000";
")
f.close()
print("Written")