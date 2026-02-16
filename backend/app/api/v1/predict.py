from fastapi import APIRouter

from app.services.prediction_service import PredictRequest, PredictResponse, predict_payload

router = APIRouter()


@router.get('/health')
def health() -> dict[str, str]:
    return {'status': 'ok'}


@router.post('/v1/risk/predict', response_model=PredictResponse)
def predict(payload: PredictRequest) -> PredictResponse:
    return predict_payload(payload.model_dump())
