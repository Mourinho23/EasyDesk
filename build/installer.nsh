!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"

!ifndef BUILD_UNINSTALLER
Var EasyDeskSensorChoice
Var EasyDeskSensorNone
Var EasyDeskSensorWith
Var EasyDeskSensorPage
Var EasyDeskNodeChoice
Var EasyDeskNodeCheckbox
!endif

!macro customInit
  StrCpy $EasyDeskSensorChoice "1"
  StrCpy $EasyDeskNodeChoice "0"
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
  !insertmacro MUI_HEADER_TEXT "Opções de instalação" "Escolhe se queres incluir componentes opcionais."
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

  ${NSD_CreateCheckbox} 0 86u 100% 24u "Autorizo o EasyDesk a instalar o Node.js 24 LTS (opcional)"
  Pop $EasyDeskNodeCheckbox
  ${NSD_CreateLabel} 18u 108u 92% 34u "Se autorizares, o EasyDesk instala o Node.js em segundo plano. O Windows pode pedir confirmação de administrador. Não precisas de abrir o terminal nem outro assistente."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function EasyDeskSensorPageLeave
  ${NSD_GetState} $EasyDeskNodeCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $EasyDeskNodeChoice "1"
  ${Else}
    StrCpy $EasyDeskNodeChoice "0"
  ${EndIf}

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

  ${If} $EasyDeskNodeChoice == "1"
    IfFileExists "$PROGRAMFILES64\nodejs\node.exe" easyDeskNodeAlreadyInstalled
    IfFileExists "$PROGRAMFILES\nodejs\node.exe" easyDeskNodeAlreadyInstalled
    IfFileExists "$LOCALAPPDATA\Programs\nodejs\node.exe" easyDeskNodeAlreadyInstalled

    IfFileExists "$INSTDIR\resources\node-installer\Node.js-Setup-x64.msi" +2 0
      Abort "O instalador do Node.js não está disponível. A instalação do EasyDesk foi interrompida."

    ExecShellWait "runas" "$SYSDIR\msiexec.exe" '/i "$INSTDIR\resources\node-installer\Node.js-Setup-x64.msi" /qn /norestart REBOOT=ReallySuppress' SW_HIDE $0
    IfErrors easyDeskNodeElevationCancelled
    ${If} $0 == 3010
      MessageBox MB_ICONINFORMATION "O Node.js foi instalado. O Windows pode pedir que reinicies o computador para concluir a configuração."
    ${ElseIf} $0 == 1602
      MessageBox MB_ICONINFORMATION "A instalação do Node.js foi cancelada. O EasyDesk foi instalado normalmente."
    ${ElseIf} $0 != 0
      MessageBox MB_ICONEXCLAMATION "Não foi possível instalar o Node.js (código $0). O EasyDesk foi instalado; podes voltar a executar o instalador e tentar novamente."
    ${EndIf}
    Goto easyDeskNodeInstallFinished

    easyDeskNodeElevationCancelled:
      MessageBox MB_ICONINFORMATION "A autorização do Windows para instalar o Node.js foi cancelada. O EasyDesk foi instalado normalmente."
      Goto easyDeskNodeInstallFinished
    easyDeskNodeAlreadyInstalled:
      MessageBox MB_ICONINFORMATION "O Node.js já está instalado. Não foi necessário instalá-lo novamente."
    easyDeskNodeInstallFinished:
  ${EndIf}

  Delete "$INSTDIR\resources\node-installer\Node.js-Setup-x64.msi"
  RMDir "$INSTDIR\resources\node-installer"
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
