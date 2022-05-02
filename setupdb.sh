paru -S mariadb # install packages
sudo mariadb-install-db --user=mysql --basedir=/usr --datadir=/var/lib/mysql

# mysql_install_db --datadir=/var/lib/mysql

sudo systemctl start mariadb # start mariadb

sudo mysql_secure_installation # clean up and secure mariadb
sudo cp startdb.sh /etc/profile.d # start mariadb on startup
