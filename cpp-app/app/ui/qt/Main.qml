import QtQuick
import QtQuick.Window

Window {
    id: root
    width: 960
    height: 600
    minimumWidth: 720
    minimumHeight: 480
    visible: true
    title: appController.appName
    color: "#f4f1eb"

    Rectangle {
        anchors.fill: parent
        color: "#f4f1eb"

        Rectangle {
            id: topBar
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            height: 64
            color: "#15171a"

            Text {
                anchors.left: parent.left
                anchors.leftMargin: 28
                anchors.verticalCenter: parent.verticalCenter
                text: appController.appName
                color: "#f7f2e8"
                font.pixelSize: 20
                font.weight: Font.DemiBold
            }

            Text {
                anchors.right: parent.right
                anchors.rightMargin: 28
                anchors.verticalCenter: parent.verticalCenter
                text: appController.status
                color: "#d7cdbf"
                font.pixelSize: 13
            }
        }

        Flickable {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: topBar.bottom
            anchors.bottom: parent.bottom
            contentWidth: width
            contentHeight: contentColumn.height + 96
            clip: true

            Column {
                id: contentColumn
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.leftMargin: 48
                anchors.rightMargin: 48
                anchors.top: parent.top
                anchors.topMargin: 48
                spacing: 22

                Text {
                    width: parent.width
                    text: "Mock auth shell"
                    color: "#191d22"
                    font.pixelSize: 32
                    font.weight: Font.DemiBold
                    wrapMode: Text.WordWrap
                }

                Column {
                    width: parent.width
                    spacing: 8

                    Text {
                        width: parent.width
                        text: "SDK version: " + appController.sdkVersion
                        color: "#3f454d"
                        font.pixelSize: 18
                        wrapMode: Text.WordWrap
                    }

                    Text {
                        width: parent.width
                        text: "API mode: " + appController.apiPrefix + " strict"
                        color: "#3f454d"
                        font.pixelSize: 18
                        wrapMode: Text.WordWrap
                    }

                    Text {
                        width: parent.width
                        text: "Status: " + appController.status
                        color: "#3f454d"
                        font.pixelSize: 18
                        wrapMode: Text.WordWrap
                    }
                }

                Rectangle {
                    width: parent.width
                    height: loginPanel.height + 40
                    color: "#ffffff"
                    border.color: "#d8d2c6"
                    border.width: 1
                    radius: 8

                    Column {
                        id: loginPanel
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: parent.top
                        anchors.leftMargin: 20
                        anchors.rightMargin: 20
                        anchors.topMargin: 20
                        spacing: 14

                        Text {
                            width: parent.width
                            text: appController.currentUserLabel
                            color: appController.isLoggedIn ? "#236b4f" : "#3f454d"
                            font.pixelSize: 20
                            font.weight: Font.DemiBold
                            wrapMode: Text.WordWrap
                        }

                        Text {
                            width: parent.width
                            text: "Mock auth only. No network request is sent and no token is persisted."
                            color: "#59616b"
                            font.pixelSize: 14
                            wrapMode: Text.WordWrap
                        }

                        Rectangle {
                            width: parent.width
                            height: 44
                            color: "#f8f6f2"
                            border.color: emailInput.activeFocus ? "#3970b7" : "#d8d2c6"
                            border.width: 1
                            radius: 6

                            TextInput {
                                id: emailInput
                                anchors.fill: parent
                                anchors.leftMargin: 12
                                anchors.rightMargin: 12
                                verticalAlignment: TextInput.AlignVCenter
                                text: ""
                                color: "#191d22"
                                font.pixelSize: 16
                                selectByMouse: true
                                inputMethodHints: Qt.ImhEmailCharactersOnly | Qt.ImhNoAutoUppercase
                                onTextChanged: appController.clearMessage()
                            }

                            Text {
                                anchors.left: parent.left
                                anchors.leftMargin: 12
                                anchors.verticalCenter: parent.verticalCenter
                                visible: emailInput.text.length === 0
                                text: "Email"
                                color: "#8c857a"
                                font.pixelSize: 16
                            }
                        }

                        Rectangle {
                            width: parent.width
                            height: 44
                            color: "#f8f6f2"
                            border.color: passwordInput.activeFocus ? "#3970b7" : "#d8d2c6"
                            border.width: 1
                            radius: 6

                            TextInput {
                                id: passwordInput
                                anchors.fill: parent
                                anchors.leftMargin: 12
                                anchors.rightMargin: 12
                                verticalAlignment: TextInput.AlignVCenter
                                text: ""
                                color: "#191d22"
                                font.pixelSize: 16
                                echoMode: TextInput.Password
                                selectByMouse: true
                                onTextChanged: appController.clearMessage()
                                onAccepted: appController.mockLogin(emailInput.text, passwordInput.text)
                            }

                            Text {
                                anchors.left: parent.left
                                anchors.leftMargin: 12
                                anchors.verticalCenter: parent.verticalCenter
                                visible: passwordInput.text.length === 0
                                text: "Password"
                                color: "#8c857a"
                                font.pixelSize: 16
                            }
                        }

                        Row {
                            spacing: 12

                            Rectangle {
                                width: 132
                                height: 42
                                color: "#1d5f8f"
                                radius: 6

                                Text {
                                    anchors.centerIn: parent
                                    text: "Mock login"
                                    color: "#ffffff"
                                    font.pixelSize: 15
                                    font.weight: Font.DemiBold
                                }

                                MouseArea {
                                    anchors.fill: parent
                                    onClicked: appController.mockLogin(emailInput.text, passwordInput.text)
                                }
                            }

                            Rectangle {
                                width: 112
                                height: 42
                                color: appController.isLoggedIn ? "#efe8dd" : "#e6e1d8"
                                border.color: "#cfc6b8"
                                radius: 6

                                Text {
                                    anchors.centerIn: parent
                                    text: "Logout"
                                    color: appController.isLoggedIn ? "#2f353d" : "#80796f"
                                    font.pixelSize: 15
                                }

                                MouseArea {
                                    anchors.fill: parent
                                    enabled: appController.isLoggedIn
                                    onClicked: {
                                        passwordInput.text = ""
                                        appController.logout()
                                    }
                                }
                            }
                        }

                        Text {
                            width: parent.width
                            visible: appController.loginMessage.length > 0
                            text: appController.loginMessage
                            color: "#59616b"
                            font.pixelSize: 14
                            wrapMode: Text.WordWrap
                        }
                    }
                }

                Text {
                    width: parent.width
                    text: "Production login will be wired later through AuthSession and a secure platform TokenStore."
                    color: "#59616b"
                    font.pixelSize: 14
                    wrapMode: Text.WordWrap
                }
            }
        }
    }
}
