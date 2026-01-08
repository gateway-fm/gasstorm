-- AggLayer Database Initialization
-- Creates all required databases for AggLayer FEP stack

-- Database for OP Succinct prover
CREATE DATABASE op_succinct;
GRANT ALL PRIVILEGES ON DATABASE op_succinct TO agglayer;

-- Database for bridge service
CREATE DATABASE bridge_db;
GRANT ALL PRIVILEGES ON DATABASE bridge_db TO agglayer;

-- Database for AggKit
CREATE DATABASE aggkit_db;
GRANT ALL PRIVILEGES ON DATABASE aggkit_db TO agglayer;

-- Main agglayer database already created by POSTGRES_DB env var
