!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"

!ifndef BUILD_UNINSTALLER
Var EasyDeskSensorChoice
Var EasyDeskSensorNone
Var EasyDeskSensorWith
Var EasyDeskSensorPage
!endif

!macro customInit
  StrCpy $EasyDeskSensorChoice "1"
  ReadRegDWORD $0 HKCU "Software\EasyDesk\Installer" "InstallSensors"
  ${If} $0 == 0
    StrCpy $EasyDeskSensorChoice "0"
  ${ElseIf} $0 == 1
    StrCpy $EasyDeskSensorChoice "1"
  ${EndIf}
!macroend

!macro customWelcomePage
  Page custom EasyDeskSensorPageCreate EasyDeskSensorPageLeave
!macroend

!macro customInstallMode
  !ifndef BUILD_UNINSTALLER
    ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Services\EasyDeskSensorService" "ImagePath"
    ${If} $EasyDeskSensorChoice == "1"
      StrCpy $isForceMachineInstall "1"
    ${ElseIf} $0 != ""
      StrCpy $isForceMachineInstall "1"
    ${EndIf}
  !endif
!macroend

!ifndef BUILD_UNINSTALLER
Function EasyDeskSensorPageCreate
  !insertmacro MUI_HEADER_TEXT "Sensores de hardware" "Escolhe se queres incluir os sensores de temperatura e energia."
  nsDialogs::Create 1018
  Pop $EasyDeskSensorPage
  ${If} $EasyDeskSensorPage == error
    Abort
  ${EndIf}

  ${NSD_CreateRadioButton} 0 20u 100% 18u "Instalar sem os sensores"
  Pop $EasyDeskSensorNone
  ${NSD_CreateRadioButton} 0 48u 100% 30u "Instalar com os sensores (requer permissões de administrador)"
  Pop $EasyDeskSensorWith

  ${If} $EasyDeskSensorChoice == "1"
    ${NSD_Check} $EasyDeskSensorWith
  ${Else}
    ${NSD_Check} $EasyDeskSensorNone
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function EasyDeskSensorPageLeave
  ${NSD_GetState} $EasyDeskSensorWith $0
  ${If} $0 == ${BST_CHECKED}
    SetRegView 64
    ReadRegDWORD $1 HKLM "SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full" "Release"
    SetRegView 32
    ${If} $1 < 461808
      MessageBox MB_ICONSTOP "A opção com sensores requer o .NET Framework 4.7.2 ou superior."
      Abort
    ${EndIf}
    StrCpy $EasyDeskSensorChoice "1"
    WriteRegDWORD HKCU "Software\EasyDesk\Installer" "InstallSensors" 1
  ${Else}
    StrCpy $EasyDeskSensorChoice "0"
    WriteRegDWORD HKCU "Software\EasyDesk\Installer" "InstallSensors" 0
  ${EndIf}
FunctionEnd
!endif

!macro customInstall
  ${If} $EasyDeskSensorChoice == "1"
    ExecWait '"$SYSDIR\sc.exe" stop EasyDeskSensorService' $0
    ExecWait '"$SYSDIR\sc.exe" create EasyDeskSensorService binPath= "$INSTDIR\resources\sensor-service\EasyDesk.SensorService.exe" start= demand obj= LocalSystem DisplayName= "EasyDesk Sensor Service"' $0
    ${If} $0 != 0
      ExecWait '"$SYSDIR\sc.exe" config EasyDeskSensorService binPath= "$INSTDIR\resources\sensor-service\EasyDesk.SensorService.exe" start= demand obj= LocalSystem DisplayName= "EasyDesk Sensor Service"' $0
    ${EndIf}
    ${If} $0 != 0
      Abort "Não foi possível instalar o serviço de sensores. Confirma as permissões de administrador e tenta novamente."
    ${EndIf}
    ExecWait '"$SYSDIR\sc.exe" sdset EasyDeskSensorService "D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;LCLOCRRC;;;BU)"' $0
    ${If} $0 != 0
      Abort "Não foi possível configurar as permissões do serviço de sensores."
    ${EndIf}
    FileOpen $0 "$INSTDIR\resources\sensor-service.enabled" w
    FileWrite $0 "enabled"
    FileClose $0
  ${Else}
    ReadRegStr $1 HKLM "SYSTEM\CurrentControlSet\Services\EasyDeskSensorService" "ImagePath"
    ${If} $1 != ""
      ExecWait '"$SYSDIR\sc.exe" stop EasyDeskSensorService' $0
      ExecWait '"$SYSDIR\sc.exe" delete EasyDeskSensorService' $0
      ${If} $0 != 0
        Abort "Não foi possível remover o serviço de sensores. Confirma as permissões de administrador e tenta novamente."
      ${EndIf}
    ${EndIf}
    Delete "$INSTDIR\resources\sensor-service.enabled"
    RMDir /r "$INSTDIR\resources\sensor-service"
  ${EndIf}
!macroend

!macro customUnInstall
  ReadRegStr $1 HKLM "SYSTEM\CurrentControlSet\Services\EasyDeskSensorService" "ImagePath"
  ${If} $1 != ""
    ExecWait '"$SYSDIR\sc.exe" stop EasyDeskSensorService' $0
    ExecWait '"$SYSDIR\sc.exe" delete EasyDeskSensorService' $0
    ${If} $0 != 0
      Abort "Não foi possível remover o serviço de sensores."
    ${EndIf}
  ${EndIf}
  DeleteRegKey HKCU "Software\EasyDesk\Installer"
!macroend
