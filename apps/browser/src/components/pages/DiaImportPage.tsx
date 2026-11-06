import { View } from "react-native";
import { closeTab } from "../../state/browser/actions";
import { ImportSteps } from "../import/ImportWindow";
import { PAGE_WIDTH } from "./PageLayout";

const DIA_SOURCE = "dia";

export function DiaImportPage({ tabId }: { tabId: string }) {
  return (
    <View style={{ flex: 1 }}>
      <ImportSteps session={{ only: DIA_SOURCE, onClose: () => void closeTab(tabId) }} maxWidth={PAGE_WIDTH} />
    </View>
  );
}
