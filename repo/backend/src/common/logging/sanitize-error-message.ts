const CLI_PASSWORD_PATTERN = /(^|\s)-p[^\s]*/g;
const MYSQL_ENV_PATTERN = /(MYSQL_PWD=)([^\s]+)/g;
const URL_CREDENTIAL_PATTERN = /(mysql:\/\/[^:\s]+:)([^@\s]+)(@)/g;

export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(CLI_PASSWORD_PATTERN, '$1-p[REDACTED]')
    .replace(MYSQL_ENV_PATTERN, '$1[REDACTED]')
    .replace(URL_CREDENTIAL_PATTERN, '$1[REDACTED]$3');
}
