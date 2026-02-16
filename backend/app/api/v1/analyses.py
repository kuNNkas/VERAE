from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from app.core.dependencies import get_current_user
from app.services.analyses_service import (
    AnalysisStatusResponse,
    CreateAnalysisRequest,
    CreateAnalysisResponse,
    create_analysis,
    get_analysis_result,
    get_analysis_status,
    process_analysis_job,
)
from app.services.auth_service import UserRecord
from app.services.prediction_service import PredictResponse

router = APIRouter(prefix="/analyses", tags=["Analyses"])

ANALYSIS_NOT_FOUND_DETAIL = {
    "error_code": "analysis_not_found",
    "message": "Analysis not found for current user",
}
ANALYSIS_NOT_COMPLETED_DETAIL = {
    "error_code": "analysis_not_completed",
    "message": "Analysis is not completed yet",
}


@router.post("", response_model=CreateAnalysisResponse, status_code=status.HTTP_202_ACCEPTED)
def create_analysis_endpoint(
    payload: CreateAnalysisRequest,
    background_tasks: BackgroundTasks,
    current_user: UserRecord = Depends(get_current_user),
) -> CreateAnalysisResponse:
    response = create_analysis(current_user.id, payload)
    background_tasks.add_task(process_analysis_job, response.analysis_id)
    return response


@router.get("/{analysis_id}", response_model=AnalysisStatusResponse)
def get_analysis_status_endpoint(
    analysis_id: str,
    current_user: UserRecord = Depends(get_current_user),
) -> AnalysisStatusResponse:
    result = get_analysis_status(current_user.id, analysis_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ANALYSIS_NOT_FOUND_DETAIL,
        )
    return result


@router.get(
    "/{analysis_id}/result",
    response_model=PredictResponse,
    responses={
        status.HTTP_404_NOT_FOUND: {
            "description": "Analysis not found for current user",
            "content": {
                "application/json": {
                    "example": {"detail": ANALYSIS_NOT_FOUND_DETAIL},
                }
            },
        },
        status.HTTP_409_CONFLICT: {
            "description": "Analysis exists but is not completed yet",
            "content": {
                "application/json": {
                    "example": {"detail": ANALYSIS_NOT_COMPLETED_DETAIL},
                }
            },
        },
    },
)
def get_analysis_result_endpoint(
    analysis_id: str,
    current_user: UserRecord = Depends(get_current_user),
) -> PredictResponse:
    status_result = get_analysis_status(current_user.id, analysis_id)
    if status_result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ANALYSIS_NOT_FOUND_DETAIL,
        )

    if status_result.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=ANALYSIS_NOT_COMPLETED_DETAIL,
        )

    result = get_analysis_result(current_user.id, analysis_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ANALYSIS_NOT_FOUND_DETAIL,
        )

    return result
