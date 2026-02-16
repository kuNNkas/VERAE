from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user
from app.services.analyses_service import (
    AnalysisResultResponse,
    AnalysisStatusResponse,
    CreateAnalysisRequest,
    CreateAnalysisResponse,
    create_analysis,
    get_analysis_result,
    get_analysis_status,
)
from app.services.auth_service import UserRecord

router = APIRouter(prefix="/analyses", tags=["Analyses"])


@router.post("", response_model=CreateAnalysisResponse, status_code=status.HTTP_202_ACCEPTED)
def create_analysis_endpoint(
    payload: CreateAnalysisRequest,
    current_user: UserRecord = Depends(get_current_user),
) -> CreateAnalysisResponse:
    return create_analysis(current_user.id, payload)


@router.get("/{analysis_id}", response_model=AnalysisStatusResponse)
def get_analysis_status_endpoint(
    analysis_id: str,
    current_user: UserRecord = Depends(get_current_user),
) -> AnalysisStatusResponse:
    result = get_analysis_status(current_user.id, analysis_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error_code": "analysis_not_found", "message": "Analysis not found for current user"},
        )
    return result


@router.get("/{analysis_id}/result", response_model=AnalysisResultResponse)
def get_analysis_result_endpoint(
    analysis_id: str,
    current_user: UserRecord = Depends(get_current_user),
) -> AnalysisResultResponse:
    status_result = get_analysis_status(current_user.id, analysis_id)
    if status_result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error_code": "analysis_not_found", "message": "Analysis not found for current user"},
        )

    result = get_analysis_result(current_user.id, analysis_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error_code": "analysis_not_found", "message": "Analysis not found for current user"},
        )

    if result.explanation_summary == "PENDING":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error_code": "analysis_not_completed", "message": "Analysis is not completed yet"},
        )

    return result
