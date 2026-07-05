#pragma once

#include <string>

namespace mrright::sdk::models {

enum class ApiErrorCode {
  AdminAuthRequired,
  AuthRequired,
  CommentNotFound,
  CommunityCommentNotFound,
  CommunityPostNotFound,
  CommunityUploadNotFound,
  ContactMessageNotFound,
  DownloadRequestNotFound,
  EmailAlreadyRegistered,
  EmailAlreadyVerified,
  EmailNotRegistered,
  EmailNotVerified,
  FileTooLarge,
  FileUploadError,
  HandleTaken,
  InternalError,
  InvalidFileType,
  InvalidToken,
  ProfileAdminDisabled,
  ProjectNotFound,
  ProjectSlugTaken,
  RateLimited,
  RequestBodyInvalid,
  ResourceForbidden,
  ServiceUnavailable,
  ValidationError,
  VisitorNotFound,
  Unknown
};

struct ApiError {
  std::string code;
  ApiErrorCode knownCode = ApiErrorCode::Unknown;
  std::string message;
  int httpStatus = 0;
};

inline ApiErrorCode apiErrorCodeFromString(const std::string& code) {
  if (code == "ADMIN_AUTH_REQUIRED") return ApiErrorCode::AdminAuthRequired;
  if (code == "AUTH_REQUIRED") return ApiErrorCode::AuthRequired;
  if (code == "COMMENT_NOT_FOUND") return ApiErrorCode::CommentNotFound;
  if (code == "COMMUNITY_COMMENT_NOT_FOUND") return ApiErrorCode::CommunityCommentNotFound;
  if (code == "COMMUNITY_POST_NOT_FOUND") return ApiErrorCode::CommunityPostNotFound;
  if (code == "COMMUNITY_UPLOAD_NOT_FOUND") return ApiErrorCode::CommunityUploadNotFound;
  if (code == "CONTACT_MESSAGE_NOT_FOUND") return ApiErrorCode::ContactMessageNotFound;
  if (code == "DOWNLOAD_REQUEST_NOT_FOUND") return ApiErrorCode::DownloadRequestNotFound;
  if (code == "EMAIL_ALREADY_REGISTERED") return ApiErrorCode::EmailAlreadyRegistered;
  if (code == "EMAIL_ALREADY_VERIFIED") return ApiErrorCode::EmailAlreadyVerified;
  if (code == "EMAIL_NOT_REGISTERED") return ApiErrorCode::EmailNotRegistered;
  if (code == "EMAIL_NOT_VERIFIED") return ApiErrorCode::EmailNotVerified;
  if (code == "FILE_TOO_LARGE") return ApiErrorCode::FileTooLarge;
  if (code == "FILE_UPLOAD_ERROR") return ApiErrorCode::FileUploadError;
  if (code == "HANDLE_TAKEN") return ApiErrorCode::HandleTaken;
  if (code == "INTERNAL_ERROR") return ApiErrorCode::InternalError;
  if (code == "INVALID_FILE_TYPE") return ApiErrorCode::InvalidFileType;
  if (code == "INVALID_TOKEN") return ApiErrorCode::InvalidToken;
  if (code == "PROFILE_ADMIN_DISABLED") return ApiErrorCode::ProfileAdminDisabled;
  if (code == "PROJECT_NOT_FOUND") return ApiErrorCode::ProjectNotFound;
  if (code == "PROJECT_SLUG_TAKEN") return ApiErrorCode::ProjectSlugTaken;
  if (code == "RATE_LIMITED") return ApiErrorCode::RateLimited;
  if (code == "REQUEST_BODY_INVALID") return ApiErrorCode::RequestBodyInvalid;
  if (code == "RESOURCE_FORBIDDEN") return ApiErrorCode::ResourceForbidden;
  if (code == "SERVICE_UNAVAILABLE") return ApiErrorCode::ServiceUnavailable;
  if (code == "VALIDATION_ERROR") return ApiErrorCode::ValidationError;
  if (code == "VISITOR_NOT_FOUND") return ApiErrorCode::VisitorNotFound;
  return ApiErrorCode::Unknown;
}

} // namespace mrright::sdk::models
