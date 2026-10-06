; No desktop icon from the installer (silent installs make one every time): settings > System
; has "Add desktop icon". The finish page checkbox still works, it runs after this hook.
Var AdmHadDesktopIcon

!macro NSIS_HOOK_PREINSTALL
  StrCpy $AdmHadDesktopIcon 0
  ${If} ${FileExists} "$DESKTOP\${PRODUCTNAME}.lnk"
    StrCpy $AdmHadDesktopIcon 1
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $AdmHadDesktopIcon = 0
    Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  ${EndIf}
!macroend
