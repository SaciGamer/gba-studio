import { IScriptsElement } from "@/providers/contexts/interfaces/ISceneElement";
import { SettingOutlined } from "@ant-design/icons";
import { Button, Dropdown, Menu } from "antd";
import { Content } from "antd/es/layout/layout";

interface MenuEventItemProps {
  event: IScriptsElement;
  onRemove: (id: string) => void;
	onToggleDisable: (id: string) => void;
}

export default function MenuEventItem({ event, onRemove, onToggleDisable }: MenuEventItemProps) {
	const isDisabled = event.args?.__comment === true;

  const menu = (
    <Menu
      items={[
				{
          key: "disable",
          label: isDisabled ? "Enable Event" : "Disable Event",
       		onClick: (e) => { 
            e.domEvent.stopPropagation();
						onToggleDisable(event.id);
					},
        },
        // {
        //   key: "copy",
        //   label: "Copy Event",
       	// 	onClick: (e) => { 
        //     e.domEvent.stopPropagation();
				// 	},
        // },
				{
          key: "remove",
          label: "Delete Event",
       		onClick: (e) => { 
            e.domEvent.stopPropagation();
            onRemove(event.id);
					},
        },
      ]}
    />
  );

  return (
    <Content style={{ display: "flex", justifyContent: "space-between" }}>
      <Dropdown overlay={menu} trigger={["click"]}>
        <Button type="text" onClick={(e) => e.stopPropagation()} >
          <SettingOutlined />
        </Button>
      </Dropdown>
    </Content>
  );
}