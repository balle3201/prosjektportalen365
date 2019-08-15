import { dateAdd } from '@pnp/common';
import { Logger, LogLevel } from '@pnp/logging';
import { List, sp } from '@pnp/sp';
import { taxonomy } from '@pnp/sp-taxonomy';
import { IPhaseChecklistItem, Phase } from 'models';
import { MessageBar, MessageBarType } from 'office-ui-fabric-react/lib/MessageBar';
import { Spinner } from 'office-ui-fabric-react/lib/Spinner';
import * as strings from 'ProjectWebPartsStrings';
import * as React from 'react';
import * as format from 'string-format';
import ChangePhaseDialog from './ChangePhaseDialog/index';
import { ChecklistData } from './ChecklistData';
import { IProjectPhasesProps } from './IProjectPhasesProps';
import { IProjectPhasesData, IProjectPhasesState } from './IProjectPhasesState';
import ProjectPhase from './ProjectPhase/index';
import ProjectPhaseCallout from './ProjectPhaseCallout/index';
import styles from './ProjectPhases.module.scss';

export class ProjectPhases extends React.Component<IProjectPhasesProps, IProjectPhasesState> {
  private _checkList: List;

  /**
   * Constructor
   * 
   * @param {IProjectPhasesProps} props Initial props
   */
  constructor(props: IProjectPhasesProps) {
    super(props);
    this.state = { isLoading: true, data: {} };
    this._checkList = sp.web.lists.getByTitle(strings.PhaseChecklistName);
  }

  public async componentDidMount() {
    if (this.props.phaseField) {
      const data = await this.fetchData();
      this.setState({ isLoading: false, data });
    }
  }

  /**
   * Renders the <ProjectPhases /> component
   */
  public render(): React.ReactElement<IProjectPhasesProps> {
    if (!this.props.phaseField) {
      return (
        <div className={styles.projectPhases}>
          <div className={styles.container}>
            <MessageBar messageBarType={MessageBarType.error}>{strings.WebPartNotConfiguredMessage}</MessageBar>
          </div>
        </div>
      );
    }
    if (this.state.isLoading) {
      return (
        <div className={styles.projectPhases}>
          <div className={styles.container}>
            <Spinner label={format(strings.LoadingText, 'fasevelger')} />
          </div>
        </div>
      );
    }

    const { phases, currentPhase } = this.state.data;

    let visiblePhases = phases.filter(p => p.properties.ShowOnFrontpage !== 'false');

    return (
      <div className={styles.projectPhases}>
        <div className={styles.container}>
          <ul className={styles.phaseList}>
            {visiblePhases.map(phase => (
              <ProjectPhase
                phase={phase}
                isCurrentPhase={currentPhase && (phase.id === currentPhase.id)}
                onOpenCallout={target => this.onOpenCallout(target, phase)} />
            ))}
          </ul>
        </div>
        {this.state.phaseMouseOver && (
          <ProjectPhaseCallout
            phase={this.state.phaseMouseOver}
            isCurrentPhase={currentPhase && (this.state.phaseMouseOver.model.id === currentPhase.id)}
            phaseSubTextProperty={this.props.phaseSubTextProperty}
            webAbsoluteUrl={this.props.pageContext.web.absoluteUrl}
            onChangePhase={phase => this.setState({ confirmPhase: phase })}
            onDismiss={this.onProjectPhaseCalloutDismiss.bind(this)}
            gapSpace={5} />
        )}
        {this.state.confirmPhase && (
          <ChangePhaseDialog
            activePhase={this.state.data.currentPhase}
            newPhase={this.state.confirmPhase}
            phaseChecklist={this._checkList}
            onDismiss={_ => this.setState({ confirmPhase: null })}
            onChangePhase={this.onChangePhase.bind(this)} />
        )}
      </div>
    );
  }

  /**
   * On open callout
   * 
   * @param {HTMLSpanElement} target Target
   * @param {Phase} phase Phase
   */
  private onOpenCallout(target: HTMLSpanElement, phase: Phase): void {
    this.setState({ phaseMouseOver: { target, model: phase } });
  }

  /**
   * On <ProjectPhaseCallout /> dismiss
   */
  private onProjectPhaseCalloutDismiss() {
    this.setState({ phaseMouseOver: null });
  }

  /**
   * Change phase
   * 
   * @param {Phase} phase Phase
   */
  private async onChangePhase(phase: Phase) {
    try {
      Logger.log({ message: `(ProjectPhases) onChangePhase: Changing phase to ${phase.name}`, level: LogLevel.Info });
      this.setState({ isChangingPhase: true });
      await this.updatePhase(phase);
      await this.modifyDocumentViews(phase.name);
      sessionStorage.clear();
      this.setState({ data: { ...this.state.data, currentPhase: phase }, confirmPhase: null, isChangingPhase: false });
      if (this.props.automaticReload) {
        window.setTimeout(() => {
          document.location.href = this.props.pageContext.web.absoluteUrl;
        }, (this.props.reloadTimeout * 5000));
      } else {
        Logger.log({ message: '(ProjectPhases) onChangePhase: Successfully changed phase. Automatic reload is disabled.', level: LogLevel.Info });
      }
    } catch (error) {
      Logger.log({ message: '(ProjectPhases) onChangePhase: Failed to change phase', level: LogLevel.Warning });
      console.log(error);
      this.setState({ confirmPhase: null, isChangingPhase: false });
    }
  }

  /**
   * Modify frontpage views
   * 
   * @param {string} phaseTermName Phase term name
   */
  private async modifyDocumentViews(phaseTermName: string) {
    const documentsViews = sp.web.lists.getByTitle(strings.DocumentsListName).views;
    let [documentsFrontpageView] = await documentsViews.select('Id', 'ViewQuery').filter(`Title eq '${this.props.currentPhaseViewName}'`).get<{ Id: string, ViewQuery: string }[]>();
    if (documentsFrontpageView) {
      const viewQueryDom = new DOMParser().parseFromString(`<Query>${documentsFrontpageView.ViewQuery}</Query>`, 'text/xml');
      const orderByDomElement = viewQueryDom.getElementsByTagName('OrderBy')[0];
      const orderBy = orderByDomElement ? orderByDomElement.outerHTML : '';
      const newViewQuery = [orderBy, `<Where><Eq><FieldRef Name='GtProjectPhase' /><Value Type='Text'>${phaseTermName}</Value></Eq></Where>`].join('');
      try {
        await documentsViews.getById(documentsFrontpageView.Id).update({ ViewQuery: newViewQuery });
        Logger.write(`(ProjectPhases) modifyDocumentViews: Successfully updated ViewQuery for view '${this.props.currentPhaseViewName}' for list '${strings.DocumentsListName}'`, LogLevel.Info);
      } catch (err) {
        Logger.write(`(ProjectPhases) modifyDocumentViews: Failed to update ViewQuery for view '${this.props.currentPhaseViewName}' for list '${strings.DocumentsListName}'`, LogLevel.Error);
      }
    }
  }

  /**
   * Fetch check point data
   */
  private async fetchChecklistData(): Promise<ChecklistData> {
    try {
      const items = await this._checkList
        .items
        .select(
          'ID',
          'Title',
          'GtComment',
          'GtChecklistStatus',
          'GtProjectPhase'
        )
        .get<IPhaseChecklistItem[]>();
      const checklistData: ChecklistData = items
        .filter(item => item.GtProjectPhase)
        .reduce((obj, item) => {
          const status = item.GtChecklistStatus.toLowerCase();
          const termId = `/Guid(${item.GtProjectPhase.TermGuid})/`;
          obj[termId] = obj[termId] ? obj[termId] : {};
          obj[termId].stats = obj[termId].stats || {};
          obj[termId].items = obj[termId].items || [];
          obj[termId].items.push(item);
          obj[termId].stats[status] = obj[termId].stats[status] ? obj[termId].stats[status] + 1 : 1;
          return obj;
        }, {});
      return checklistData;
    } catch (e) {
      return {};
    }
  }

  /**
   * Get phase field context
   * 
   * @param {string} fieldName Field name for phase
   */
  private async getPhaseFieldContext(fieldName: string) {
    const [phaseField, textField] = await Promise.all([
      sp.web.fields.getByInternalNameOrTitle(fieldName)
        .select('TermSetId')
        .usingCaching({
          key: `projectphases_termsetid`,
          storeName: 'session',
          expiration: dateAdd(new Date(), 'day', 1),
        }
        ).get<{ TermSetId: string }>(),
      sp.web.fields.getByInternalNameOrTitle(`${fieldName}_0`)
        .select('InternalName')
        .usingCaching({
          key: `projectphases_phasetextfield`,
          storeName: 'session',
          expiration: dateAdd(new Date(), 'day', 1),
        })
        .get<{ InternalName: string }>(),
    ]);
    return { termSetId: phaseField.TermSetId, phaseTextField: textField.InternalName };
  }

  /***
   * Fetch phase terms
   */
  private async fetchData(): Promise<IProjectPhasesData> {
    try {
      const { termSetId, phaseTextField } = await this.getPhaseFieldContext(this.props.phaseField);
      const [phaseTerms, entityItem, checklistData] = await Promise.all([
        taxonomy.getDefaultSiteCollectionTermStore()
          .getTermSetById(termSetId)
          .terms
          .select('Id', 'Name', 'LocalCustomProperties')
          .usingCaching({
            key: `projectphases_terms`,
            storeName: 'session',
            expiration: dateAdd(new Date(), 'day', 1),
          }).get(),
        this.props.spEntityPortalService.getEntityItem(this.props.pageContext.site.id.toString()),
        this.fetchChecklistData(),
      ]);

      let phases = phaseTerms.map(term => new Phase(term.Name, term.Id, checklistData[term.Id], term.LocalCustomProperties));

      let currentPhase: Phase = null;
      if (entityItem && entityItem.GtProjectPhase) {
        [currentPhase] = phases.filter(p => p.id.indexOf(entityItem.GtProjectPhase.TermGuid) !== -1);
      }
      Logger.log({ message: '(ProjectPhases) fetchData: Successfully fetch phases', level: LogLevel.Info });
      return { currentPhase, phases, phaseTextField };
    } catch (err) {
      throw err;
    }
  }

  /**
   * Update phase
   * 
   * @param {Phase} phase Phase
   */
  private async updatePhase(phase: Phase): Promise<void> {
    let properties = { [this.state.data.phaseTextField]: phase.toString() };
    Logger.log({ message: '(ProjectPhases) updatePhase: Updating phase on entity item', data: properties, level: LogLevel.Info });
    try {
      await this.props.spEntityPortalService.updateEntityItem(this.props.pageContext.site.id.toString(), properties);
    } catch (error) {
      throw error;
    }
  }
}

export { IProjectPhasesProps };
