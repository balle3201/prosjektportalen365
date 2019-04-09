import * as React from 'react';
import styles from './ProjectList.module.scss';
import * as strings from 'ProjectListWebPartStrings';
import { IProjectListProps } from './IProjectListProps';
import { IProjectListState } from './IProjectListState';
import { Spinner, SpinnerType } from 'office-ui-fabric-react/lib/Spinner';
import { SearchBox } from 'office-ui-fabric-react/lib/SearchBox';
import { MessageBar, MessageBarType } from 'office-ui-fabric-react/lib/MessageBar';
import { Modal } from 'office-ui-fabric-react/lib/Modal';
import { autobind } from 'office-ui-fabric-react/lib/Utilities';
import ProjectCard from './ProjectCard/ProjectCard';
import { sp } from '@pnp/sp';
import { taxonomy } from '@pnp/sp-taxonomy';
import ProjectInformation from '../../../../../ProjectWebParts/lib/webparts/projectInformation/components/ProjectInformation';
import { ProjectListModel } from 'prosjektportalen-spfx-shared/lib/models/ProjectListModel';
import MSGraph from 'msgraph-helper';

export default class ProjectList extends React.Component<IProjectListProps, IProjectListState> {
  constructor(props: IProjectListProps) {
    super(props);
    this.state = { projects: [], isLoading: true };
  }

  public async componentDidMount() {
    try {
      const projects = await this.fetchData();
      this.setState({ projects, isLoading: false });
    } catch (error) {
      this.setState({ error, isLoading: false });
    }
  }

  public render(): React.ReactElement<IProjectListProps> {
    if (this.state.isLoading) {
      return (
        <div className={styles.projectList}>
          <Spinner label={strings.LoadingText} type={SpinnerType.large} />
        </div >
      );
    }
    if (this.state.error) {
      return (
        <div className={styles.projectList}>
          <MessageBar messageBarType={MessageBarType.error}>{strings.ErrorText}</MessageBar>
        </div >
      );
    }
    return (
      <div className={styles.projectList}>
        <div className={styles.searchBox}>
          <SearchBox placeholder={strings.SearchBoxPlaceholderText} onChanged={this.onSearch} />
        </div>
        <div className={styles.container}>
          {this.renderCards()}
        </div>
        {this.renderProjectInformation()}
      </div>
    );
  }

  /**
   * Render cards
   */
  private renderCards() {
    const projects = this.getFilteredProjects();
    if (projects.length === 0) {
      return <MessageBar>{strings.NoSearchResults}</MessageBar>;
    }
    return projects.map(project => (
      <ProjectCard
        project={project}
        onClickHref={project.Url}
        selectedProject={this.onSelectProject} />
    ));
  }

  /**
   * Render <ProjectInformation /> in a <Modal />
   */
  private renderProjectInformation() {
    if (this.state.selectedProject) {
      return (
        <Modal
          isOpen={true}
          containerClassName={styles.projectInfoModal}
          onDismiss={() => this.setState({ selectedProject: null })}>
          <ProjectInformation
            title={this.state.selectedProject.Title}
            entity={{ webUrl: this.props.siteAbsoluteUrl, ...this.props.entity }}
            hubSiteUrl={this.props.siteAbsoluteUrl}
            siteId={this.state.selectedProject.Id}
            hideEditPropertiesButton={true}
            filterField='GtShowFieldPortfolio' />
        </Modal>
      );
    }
    return null;
  }

  /**
   * On select project
   * 
   * @param {React.MouseEvent} event Event
   * @param {ProjectListModel} project Project
   */
  @autobind
  private onSelectProject(event: React.MouseEvent<any>, project: ProjectListModel) {
    event.stopPropagation();
    event.preventDefault();
    this.setState({ selectedProject: project });
  }

  /**
   * Get filtered projects
   */
  private getFilteredProjects() {
    let { projects, searchTerm } = ({ ...this.state } as IProjectListState);
    if (searchTerm) {
      projects = projects
        .filter(project => {
          const matches = Object.keys(project).filter(key => {
            const value = project[key];
            return value && typeof value === 'string' && value.toLowerCase().indexOf(searchTerm) !== -1;
          }).length;
          return matches > 0;
        })
        .sort((a, b) => a.Title > b.Title ? 1 : -1);
      return projects;
    } else {
      return projects;
    }
  }

  /**
   * On search
   * 
   * @param {string} searchTerm Search term
   */
  @autobind
  private onSearch(searchTerm: string) {
    this.setState({ searchTerm: searchTerm.toLowerCase() });
  }

  /**
   * Fetch data
   */
  private async fetchData(web = sp.web): Promise<ProjectListModel[]> {
    let [items, groups, users, phaseTerms] = await Promise.all([
      web
        .lists
        .getByTitle(this.props.entity.listName)
        .items
        .select('GtGroupId', 'GtSiteId', 'GtSiteUrl', 'GtProjectOwnerId', 'GtProjectManagerId', 'GtProjectPhase')
        .usingCaching()
        .get<{ GtGroupId: string, GtSiteId: string, GtSiteUrl: string, GtProjectOwnerId: number, GtProjectManagerId: number, GtProjectPhase: { TermGuid: string } }[]>(),
      MSGraph.Get<{ id: string, displayName: string }[]>(`/me/memberOf/$/microsoft.graph.group`, 'v1.0', ['id', 'displayName'], `groupTypes/any(a:a%20eq%20'unified')`),
      web
        .siteUsers
        .select("Id", "Title", "Email")
        .usingCaching()
        .get<{ Id: number, Title: string, Email: string }[]>(),
      taxonomy
        .getDefaultSiteCollectionTermStore()
        .getTermSetById(this.props.phaseTermSetId)
        .terms
        .usingCaching()
        .get(),
    ]);

    let projects = items
      .map(item => {
        let [group] = groups.filter(grp => grp.id === item.GtGroupId);
        if (!group) {
          return null;
        }
        let [owner] = users.filter(user => user.Id === item.GtProjectOwnerId);
        let [manager] = users.filter(user => user.Id === item.GtProjectManagerId);
        let phase = item.GtProjectPhase ? phaseTerms.filter(p => p.Id.indexOf(item.GtProjectPhase.TermGuid) !== -1)[0].Name : '';

        return ({
          Id: item.GtSiteId,
          Logo: null,
          Manager: manager,
          Owner: owner,
          Phase: phase,
          Title: group.displayName,
          Url: item.GtSiteUrl,
        } as ProjectListModel);
      })
      .filter(p => p);

    return projects;
  }
}

