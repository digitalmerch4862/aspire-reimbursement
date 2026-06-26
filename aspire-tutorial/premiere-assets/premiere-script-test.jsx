#target premierepro
var f = new File("C:/Users/Admin/Desktop/App/Aspire Reimbursement/aspire-tutorial/premiere-assets/premiere-script-test.log");
f.open("w");
f.writeln("ok");
f.writeln(app.version);
f.close();
