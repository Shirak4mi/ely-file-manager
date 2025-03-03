# 🍏 Docker Database Setup for File Metadata Management App

This file contains Docker commands to set up different databases for testing with the following configuration:
- **📂 Database Name:** `FileManagement`
- **👤 Username:** `admin`
- **🔑 Password:** `admin1234`
- **🛠 Configured to run on default ports`

---

## **🐘 PostgreSQL (Port 5432)**
```sh
docker run --name postgres-test \
  -e POSTGRES_DB=FileManagement \
  -e POSTGRES_USER=admin \
  -e POSTGRES_PASSWORD=admin1234 \
  -p 5432:5432 -d postgres
```
**🍏 PowerShell Version:**
```powershell
docker run --name postgres-test ` -e POSTGRES_DB=FileManagement ` -e POSTGRES_USER=admin ` -e POSTGRES_PASSWORD=admin1234 ` -p 5432:5432 -d postgres
```

---

## **🐬 MySQL (Port 3306)**
```sh
docker run --name mysql-test \
  -e MYSQL_DATABASE=FileManagement \
  -e MYSQL_USER=admin \
  -e MYSQL_PASSWORD=admin1234 \
  -e MYSQL_ROOT_PASSWORD=admin1234 \
  -p 3306:3306 -d mysql
```
**🍏 PowerShell Version:**
```powershell
docker run --name mysql-test ` -e MYSQL_DATABASE=FileManagement ` -e MYSQL_USER=admin ` -e MYSQL_PASSWORD=admin1234 ` -e MYSQL_ROOT_PASSWORD=admin1234 ` -p 3306:3306 -d mysql
```

---

## **☕ MariaDB (Port 3306)**
```sh
docker run --name mariadb-test \
  -e MARIADB_DATABASE=FileManagement \
  -e MARIADB_USER=admin \
  -e MARIADB_PASSWORD=admin1234 \
  -e MARIADB_ROOT_PASSWORD=admin1234 \
  -p 3306:3306 -d mariadb
```
**🍏 PowerShell Version:**
```powershell
docker run --name mariadb-test ` -e MARIADB_DATABASE=FileManagement ` -e MARIADB_USER=admin ` -e MARIADB_PASSWORD=admin1234 ` -e MARIADB_ROOT_PASSWORD=admin1234 ` -p 3306:3306 -d mariadb
```

---

## **🦞 CockroachDB (Port 26257)**
```sh
docker run --name cockroachdb-test \
  -p 26257:26257 -p 8080:8080 \
  cockroachdb/cockroach start-single-node --insecure
```
**🍏 PowerShell Version:**
```powershell
docker run --name cockroachdb-test ` -p 26257:26257 -p 8080:8080 ` cockroachdb/cockroach start-single-node --insecure
```

### **🔧 Extra Setup Steps for CockroachDB**
After starting the container, run the following command to initialize the database:
```sh
docker exec -it cockroachdb-test cockroach sql --insecure -e "CREATE DATABASE FileManagement;"
```
**🍏 PowerShell Version:**
```powershell
docker exec -it cockroachdb-test cockroach sql --insecure -e "CREATE DATABASE FileManagement;"
```
To open an interactive SQL shell inside the CockroachDB container, use:
```sh
docker exec -it cockroachdb-test cockroach sql --insecure
```
**🍏 PowerShell Version:**
```powershell
docker exec -it cockroachdb-test cockroach sql --insecure
```

---

## **🌀 SurrealDB (Port 8000)**
```sh
docker run --name surrealdb-test \
  -p 8000:8000 surrealdb/surrealdb start --user admin --pass admin1234
```
**🍏 PowerShell Version:**
```powershell
docker run --name surrealdb-test ` -p 8000:8000 surrealdb/surrealdb start --user admin --pass admin1234
```

---

## **🛑 Stopping and Removing Containers**
```sh
docker stop postgres-test mysql-test mariadb-test cockroachdb-test surrealdb-test
docker rm postgres-test mysql-test mariadb-test cockroachdb-test surrealdb-test
```
**🍏 PowerShell Version:**
```powershell
docker stop postgres-test mysql-test mariadb-test cockroachdb-test surrealdb-test; docker rm postgres-test mysql-test mariadb-test cockroachdb-test surrealdb-test
```
