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

        Rectangle {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: topBar.bottom
            anchors.bottom: parent.bottom
            color: "#f4f1eb"

            Column {
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                anchors.leftMargin: 48
                anchors.rightMargin: 48
                spacing: 18

                Text {
                    width: parent.width
                    text: "Desktop app shell"
                    color: "#191d22"
                    font.pixelSize: 32
                    font.weight: Font.DemiBold
                    wrapMode: Text.WordWrap
                }

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
        }
    }
}
