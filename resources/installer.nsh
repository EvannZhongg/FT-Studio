!macro customUnInstallSection
  Section /o "un.Delete local data / 删除本地数据"
    ${ifNot} ${isUpdated}
      Delete "$APPDATA\${PRODUCT_NAME}\ft-engine.db"
      Delete "$APPDATA\${PRODUCT_NAME}\ft-engine.db-shm"
      Delete "$APPDATA\${PRODUCT_NAME}\ft-engine.db-wal"
      RMDir /r "$APPDATA\${PRODUCT_NAME}\backups"
      RMDir /r "$APPDATA\${PRODUCT_NAME}\exports"
      RMDir /r "$APPDATA\${PRODUCT_NAME}\logs"
      RMDir "$APPDATA\${PRODUCT_NAME}"
    ${endIf}
  SectionEnd
!macroend
