from __future__ import annotations

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from db import backend_name
from auth import router as auth_router
from students import router as students_router
from drives import router as drives_router
from verification import router as verification_router
from ranking import router as ranking_router
from scheduling import router as scheduling_router
from offers import router as offers_router
from analytics import router as analytics_router
from notifications import router as notifications_router


app = FastAPI(
    title='CampusLink API',
    description='Campus-to-corporate placement workflow with three admin approval gates',
    version='2.0.0',
)

origin=os.getenv('FRONTEND_ORIGIN','http://localhost:3000')
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin, 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

for router in [auth_router,students_router,drives_router,verification_router,ranking_router,scheduling_router,offers_router,analytics_router,notifications_router]:
    app.include_router(router)


@app.get('/')
def root():
    return {'status':'ok','message':'CampusLink backend is running','database':backend_name()}


@app.get('/health')
def health():
    return {'status':'healthy','database':backend_name()}
