var mysql = require("mysql"); // mysql -u root -p modmail
var pool = mysql.createPool({
  connectionLimit: 10,
  host: "localhost",
  user: "root",
  password: "password",
  database: global.database,
  supportBigNumbers: true,
  bigNumberStrings: true,
});

module.exports = {
  execQuery: (query) => {
    return new Promise((resolve) => {
      pool.query(query, (error, results, fields) => {
        if (error) {
          throw error;
        }
        resolve([results, fields]);
      });
    });
  },
};
