# Venv

1. On first time you start the project run `python3 -m venv venv`
2. Activate the virtual environment with `source ./venv/bin/activate`
3. Install the requirements with `pip install -r requirements.txt`
4. When you finish working with the project deactivate the virtual environment with `deactivate`

# Running the app
1. Start the docker services with `docker-compose up`
2. On the first time you start the app run `python migrate.py` to populate the mongo database
3. Run `uvicorn main:app --host 0.0.0.0 --port 8001`
4. Surf to `http://0.0.0.0:8001/docs` and try the different apis

# Roadmap
- [ ] Complete `get_payment_table` api 
- [ ] Add to `migrate.py` population of events in bigquery database
- [ ] Add more tests