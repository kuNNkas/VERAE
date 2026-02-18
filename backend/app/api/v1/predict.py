from fastapi import APIRouter

from app.core.observability import log_event
from app.services.prediction_service import PredictRequest, PredictResponse, predict_payload

router = APIRouter()


@router.get('/health')
def health() -> dict[str, str]:
    return {'status': 'ok'}


@router.post('/v1/risk/predict', response_model=PredictResponse)
def predict(payload: PredictRequest) -> PredictResponse:
    response = predict_payload(payload.model_dump())
    log_event(
        'predict_called',
        status=response.status,
        confidence=response.confidence,
        missing_required_fields_count=len(response.missing_required_fields),
    )
    return response
